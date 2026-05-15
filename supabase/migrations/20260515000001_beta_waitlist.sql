-- beta_waitlist — public-facing waitlist signup for the invite-only beta.
--
-- The /auth page no longer lets visitors create their own accounts —
-- only super admins (via admin-invite-user) and existing agency admins
-- (via the team-management UI) can provision new logins. To capture
-- inbound demand, the public auth page surfaces a "Request beta access"
-- form whose submissions land here.
--
-- RLS policy:
--   - INSERT: allowed for anon role (the form is shown before sign-in).
--   - SELECT/UPDATE/DELETE: super_admin only (managed via app_roles).
--   - No anonymous reads — submissions are private to the operator.

CREATE TABLE IF NOT EXISTS public.beta_waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  name        TEXT,
  agency      TEXT,
  -- Free-text "tell us about your work" field — kept short server-side
  -- via CHECK so a single submission can't dump arbitrary content.
  reason      TEXT,
  -- Optional UTM-style attribution if the form is ever surfaced from
  -- a marketing link. Defaults to NULL on the auth-page form.
  source      TEXT,
  -- Submission state for the operator's queue:
  --   "pending"   = received, not yet contacted
  --   "contacted" = operator has reached out
  --   "invited"   = invite sent via admin-invite-user
  --   "declined"  = operator passed
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'contacted', 'invited', 'declined')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT beta_waitlist_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT beta_waitlist_reason_length CHECK (reason IS NULL OR char_length(reason) <= 1000),
  CONSTRAINT beta_waitlist_name_length   CHECK (name   IS NULL OR char_length(name)   <= 200),
  CONSTRAINT beta_waitlist_agency_length CHECK (agency IS NULL OR char_length(agency) <= 200)
);

-- Avoid duplicate spam from the same email address. UNIQUE on
-- lower(email) so casing variants don't slip through.
CREATE UNIQUE INDEX IF NOT EXISTS beta_waitlist_email_lower_idx
  ON public.beta_waitlist (LOWER(email));

CREATE INDEX IF NOT EXISTS beta_waitlist_status_idx
  ON public.beta_waitlist (status, created_at DESC);

ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;

-- Anon insert: anyone visiting the auth page can submit.
DROP POLICY IF EXISTS "beta_waitlist anon insert" ON public.beta_waitlist;
CREATE POLICY "beta_waitlist anon insert"
ON public.beta_waitlist
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Super-admin select / update / delete. Uses the existing
-- is_super_admin() helper that other admin policies rely on.
DROP POLICY IF EXISTS "beta_waitlist super_admin select" ON public.beta_waitlist;
CREATE POLICY "beta_waitlist super_admin select"
ON public.beta_waitlist
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "beta_waitlist super_admin update" ON public.beta_waitlist;
CREATE POLICY "beta_waitlist super_admin update"
ON public.beta_waitlist
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "beta_waitlist super_admin delete" ON public.beta_waitlist;
CREATE POLICY "beta_waitlist super_admin delete"
ON public.beta_waitlist
FOR DELETE
TO authenticated
USING (public.is_super_admin(auth.uid()));
