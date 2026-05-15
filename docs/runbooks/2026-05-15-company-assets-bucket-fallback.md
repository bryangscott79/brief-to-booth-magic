# Fallback: Apply `company-assets` Storage Bucket Migration

**Date:** 2026-05-15
**Migration:** `supabase/migrations/20260515000000_ensure_company_assets_bucket.sql`
**Commit:** d9ea939
**Project ref:** `kjbamfitkaxnfyppplaq`

## Why this runbook exists

The original bucket migration (`20260223180000_company_branding.sql`, February) was committed to the repo but **never applied** to the live Supabase project — Lovable's migration pipeline silently skipped it. The result: logo uploads in Company Settings fail with `Bucket not found`.

The new migration (`20260515000000_ensure_company_assets_bucket.sql`) is fully idempotent — it uses `ON CONFLICT (id) DO UPDATE` for the bucket and `DROP POLICY IF EXISTS` + `CREATE POLICY` for the four RLS policies, so it's safe to run repeatedly even if the February migration partially landed.

If Lovable's auto-apply runs successfully, you can skip this runbook. If it doesn't (check the Supabase dashboard's Storage tab — if `company-assets` is missing, it didn't), use one of the two paths below.

---

## A. Supabase Dashboard SQL Editor path (recommended — no CLI needed)

1. Open the SQL Editor for the project:
   **https://supabase.com/dashboard/project/kjbamfitkaxnfyppplaq/sql/new**

2. Paste the SQL block below **verbatim** into the editor.

3. Click **Run** (or press Cmd+Enter). You should see `Success. No rows returned`.

```sql
-- ── Bucket ────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  2097152, -- 2MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── RLS policies ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can upload their own company assets" ON storage.objects;
CREATE POLICY "Users can upload their own company assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-assets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own company assets" ON storage.objects;
CREATE POLICY "Users can update their own company assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-assets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own company assets" ON storage.objects;
CREATE POLICY "Users can delete their own company assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-assets' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Company assets are publicly readable" ON storage.objects;
CREATE POLICY "Company assets are publicly readable"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'company-assets');
```

4. **Note:** This block is the storage-bucket portion only. The February migration also added branding columns (`logo_url`, `brand_color`, etc.) to `company_profiles`. Those columns are already there if Company Settings has been loading at all — if you're not sure, you can also paste this prefix block first (it's idempotent thanks to `IF NOT EXISTS`):

```sql
ALTER TABLE company_profiles
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_dark_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#0047AB',
  ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#4682B4',
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS tagline TEXT;
```

---

## B. Supabase CLI path

Assumes the CLI is installed (`brew install supabase/tap/supabase` if not).

```bash
# 1. Authenticate (opens a browser; one-time per machine)
supabase login

# 2. Link this repo to the live project (one-time per repo clone)
cd "/Users/bryanscott/Desktop/Brief to Booth"
supabase link --project-ref kjbamfitkaxnfyppplaq

# 3. Push pending migrations
supabase db push
```

### Caveats

- `supabase db push` applies **all** migrations in `supabase/migrations/` that the remote `schema_migrations` table doesn't yet know about — not just the new one. If the February migration (`20260223180000_company_branding.sql`) was never marked applied remotely, the CLI will try to run it too, and the bare `CREATE POLICY` statements in that file **will fail** with `policy "..." for relation "objects" already exists` if the new May migration ran first.
- **Mitigation:** if you've already applied the May SQL via path A, run `supabase migration repair --status applied 20260223180000` and `supabase migration repair --status applied 20260515000000` before `db push` to tell Supabase those migrations are already done. Then `supabase db push` will be a no-op for these two.
- If you haven't run path A and want to use the CLI clean: just run `supabase db push`. The May migration is idempotent, but the February one isn't — if the CLI applies February first, it will succeed; if it tries to apply February *after* May, it will fail on the duplicate policies. The CLI applies in timestamp order, so February runs first, and it should succeed.
- The CLI prompts `Do you want to push these migrations? [Y/n]` — review the list before confirming.

---

## C. Verification

### 1. Confirm the bucket exists

In the SQL Editor (same URL as path A), run:

```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'company-assets';
```

**Expected:** one row, `public = true`, `file_size_limit = 2097152`.

### 2. Confirm the four RLS policies exist

```sql
SELECT polname
FROM pg_policy
WHERE polrelid = 'storage.objects'::regclass
  AND polname LIKE '%company assets%';
```

**Expected:** four rows —
- `Users can upload their own company assets`
- `Users can update their own company assets`
- `Users can delete their own company assets`
- `Company assets are publicly readable`

### 3. Browser smoke test

1. Open the app (local dev or deployed).
2. Sign in.
3. Navigate to **Company Settings**.
4. Upload a small PNG/JPG/SVG/WebP logo (under 2 MB).
5. The logo should render in the preview without the `Bucket not found` error.
6. Refresh the page — the logo should persist.

### 4. If it still fails

- Open browser devtools → Network tab → look for the `storage/v1/object/company-assets/...` upload request.
- A `400` with `{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}` means the bucket SQL didn't land — re-run path A.
- A `400` with a `new row violates row-level security policy` means the bucket exists but the policies didn't — re-run just the `DROP POLICY ... CREATE POLICY` section of path A.
- A `413` means the file is over 2 MB — the limit, not a migration problem.

---

## Audit notes (for future reference)

- The February migration's bare `CREATE POLICY` calls (no `DROP IF EXISTS`) are the reason it can't be safely re-applied if it partially landed. The May migration fixes this.
- `storage.foldername(name)[1] = auth.uid()::text` confines writes to a per-user top-level folder. The app stores logos under `<user_id>/logos/<filename>` — keep that pattern when adding new asset types or the INSERT policy will block uploads.
- Reads are intentionally `TO public` so logos can be embedded in exported PDFs/decks without signed URLs. If branding ever needs to be private, change the SELECT policy to `TO authenticated` with the same folder check.
- Supabase enables RLS on `storage.objects` by default; neither migration needs an explicit `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
