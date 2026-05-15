-- ensure_company_assets_bucket
--
-- The original company-assets bucket migration (20260223180000) was
-- never applied to the live Supabase project — Lovable's migration
-- pipeline silently skipped it, leaving the logo upload in Company
-- Settings broken with "Bucket not found." This migration is a
-- fully idempotent re-application that re-runs cleanly even if the
-- previous migration partially landed (e.g. bucket exists but
-- policies don't, or vice versa).
--
-- Safe to run repeatedly. Policies use DROP IF EXISTS + CREATE
-- because Postgres CREATE POLICY doesn't support IF NOT EXISTS.

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
-- The folder structure is `<user_id>/logos/<filename>` so the
-- `(storage.foldername(name))[1] = auth.uid()::text` check confines
-- writes to each user's own folder. Reads are public so logos can
-- be embedded in exported deliverables without signed URLs.

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
