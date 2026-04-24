-- Add agency_id to clients to scope clients to agencies
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_clients_agency_id ON public.clients(agency_id);

-- Backfill agency_id from the user's primary (owner) agency for existing rows
UPDATE public.clients c
SET agency_id = a.id
FROM public.agencies a
WHERE c.agency_id IS NULL
  AND a.owner_user_id = c.user_id;

-- Add agency-aware RLS policies (keep existing user_id ones for backward compat)
DROP POLICY IF EXISTS "Agency members can view clients" ON public.clients;
CREATE POLICY "Agency members can view clients"
  ON public.clients FOR SELECT
  USING (agency_id IS NOT NULL AND public.is_agency_member(agency_id));

DROP POLICY IF EXISTS "Agency members can insert clients" ON public.clients;
CREATE POLICY "Agency members can insert clients"
  ON public.clients FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (agency_id IS NULL OR public.is_agency_member(agency_id))
  );

DROP POLICY IF EXISTS "Agency members can update clients" ON public.clients;
CREATE POLICY "Agency members can update clients"
  ON public.clients FOR UPDATE
  USING (agency_id IS NOT NULL AND public.is_agency_member(agency_id));

DROP POLICY IF EXISTS "Agency admins can delete clients" ON public.clients;
CREATE POLICY "Agency admins can delete clients"
  ON public.clients FOR DELETE
  USING (agency_id IS NOT NULL AND public.is_agency_admin(agency_id));