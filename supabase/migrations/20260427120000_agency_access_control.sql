-- =========================================================================
-- AGENCY ACCESS CONTROL — super-admin gating layer
--
-- Purpose: Let super admins suspend, disable, expire-trial, and feature-flag
-- agencies. Honored by RLS so suspended/disabled agencies CANNOT create or
-- modify data; they may still SELECT their own context (so the app can show
-- a suspension banner with reason + contact info).
--
-- New columns on agencies:
--   access_status text   — 'active' | 'trial' | 'suspended' | 'disabled'
--   trial_ends_at        — when set + access_status='trial', auto-expires
--   suspension_reason    — text shown to the agency
--   suspended_at         — when the suspension took effect
--   suspended_by         — super admin who triggered it
--   feature_flags jsonb  — per-agency feature toggles (e.g. {generate:false})
--   quotas       jsonb   — per-agency limits (e.g. {projects_per_month:10})
--   admin_notes  text    — super-admin-only freeform notes
--
-- New table:
--   agency_access_log — append-only audit trail of every state change
--
-- New functions:
--   agency_has_access(_agency_id)  — bool, honors trial expiry transparently
--   suspend_agency(_agency_id, _reason)
--   reactivate_agency(_agency_id)
--   disable_agency(_agency_id, _reason)
--   set_agency_trial(_agency_id, _ends_at)
--   update_agency_feature_flags(_agency_id, _flags)
--   update_agency_quotas(_agency_id, _quotas)
--   list_agencies_for_admin()  — super-admin overview of every agency
-- =========================================================================

-- 1. Columns on agencies -----------------------------------------------------
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active'
    CHECK (access_status IN ('active','trial','suspended','disabled')),
  ADD COLUMN IF NOT EXISTS trial_ends_at    timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at     timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS feature_flags    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quotas           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_notes      text;

CREATE INDEX IF NOT EXISTS agencies_access_status_idx ON public.agencies(access_status);
CREATE INDEX IF NOT EXISTS agencies_trial_ends_at_idx ON public.agencies(trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

COMMENT ON COLUMN public.agencies.access_status IS
  'Effective access state. RLS write policies gate by agency_has_access().';
COMMENT ON COLUMN public.agencies.feature_flags IS
  'Per-agency feature toggles, e.g. {"generate":true,"export":false,"rag":true}';
COMMENT ON COLUMN public.agencies.quotas IS
  'Per-agency limits, e.g. {"max_projects":50,"max_seats":15,"ai_compute_monthly":10000}';

-- 2. Audit log ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_access_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  action        text NOT NULL,
  -- Examples: 'suspended','reactivated','disabled','trial_set','trial_extended',
  -- 'feature_flags_updated','quotas_updated','admin_notes_updated'
  performed_by  uuid REFERENCES auth.users(id),
  reason        text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Snapshot of state before/after for forensic replay
  before_state  jsonb,
  after_state   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_access_log_agency_idx ON public.agency_access_log(agency_id, created_at DESC);

ALTER TABLE public.agency_access_log ENABLE ROW LEVEL SECURITY;

-- Super admins see everything
CREATE POLICY "Super admins see all access logs"
  ON public.agency_access_log FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- Agency owners see their own agency's log
CREATE POLICY "Owners see their agency access log"
  ON public.agency_access_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agencies a
      WHERE a.id = agency_access_log.agency_id
        AND a.owner_user_id = auth.uid()
    )
  );

-- Only RPCs (SECURITY DEFINER) write to this table
CREATE POLICY "Only system writes access log"
  ON public.agency_access_log FOR INSERT
  WITH CHECK (false);

-- 3. Effective-access function ----------------------------------------------
-- Returns true when the agency may write data. Honors trial expiry.
-- Super admins bypass entirely (handled at the policy layer, not here).
CREATE OR REPLACE FUNCTION public.agency_has_access(_agency_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agencies
    WHERE id = _agency_id
      AND access_status IN ('active','trial')
      AND (trial_ends_at IS NULL OR trial_ends_at > now())
  );
$$;

COMMENT ON FUNCTION public.agency_has_access(uuid) IS
  'True when the agency is active or on a trial that has not expired.';

-- Helper used by the UI to compute "effective" status (honors trial expiry).
CREATE OR REPLACE FUNCTION public.agency_effective_status(_agency_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    CASE
      WHEN access_status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now()
        THEN 'trial_expired'
      ELSE access_status
    END
  FROM public.agencies WHERE id = _agency_id;
$$;

-- 4. Super-admin RPCs --------------------------------------------------------
-- All RPCs share this guard pattern; we centralize it.
CREATE OR REPLACE FUNCTION public._require_super_admin()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: super admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Internal helper: append to access log + return the row id
CREATE OR REPLACE FUNCTION public._log_agency_access(
  _agency_id uuid,
  _action text,
  _reason text,
  _before jsonb,
  _after jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO public.agency_access_log
    (agency_id, action, performed_by, reason, metadata, before_state, after_state)
  VALUES
    (_agency_id, _action, auth.uid(), _reason, COALESCE(_metadata, '{}'::jsonb), _before, _after)
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

-- Snapshot helper for before/after rows
CREATE OR REPLACE FUNCTION public._agency_snapshot(_agency_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'access_status', access_status,
    'trial_ends_at', trial_ends_at,
    'suspension_reason', suspension_reason,
    'feature_flags', feature_flags,
    'quotas', quotas
  )
  FROM public.agencies WHERE id = _agency_id;
$$;

-- ─── suspend_agency ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.suspend_agency(_agency_id uuid, _reason text DEFAULT NULL)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET access_status     = 'suspended',
      suspension_reason = _reason,
      suspended_at      = now(),
      suspended_by      = auth.uid(),
      updated_at        = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(
    _agency_id, 'suspended', _reason, before_snap, public._agency_snapshot(_agency_id)
  );

  RETURN updated_row;
END;
$$;

-- ─── reactivate_agency ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reactivate_agency(_agency_id uuid, _reason text DEFAULT NULL)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET access_status     = 'active',
      suspension_reason = NULL,
      suspended_at      = NULL,
      suspended_by      = NULL,
      updated_at        = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(
    _agency_id, 'reactivated', _reason, before_snap, public._agency_snapshot(_agency_id)
  );

  RETURN updated_row;
END;
$$;

-- ─── disable_agency ────────────────────────────────────────────────────────
-- "Disabled" is harsher than suspended — agency members are signed out
-- (frontend) and treated as having no access. Used for terminated accounts.
CREATE OR REPLACE FUNCTION public.disable_agency(_agency_id uuid, _reason text DEFAULT NULL)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET access_status     = 'disabled',
      suspension_reason = _reason,
      suspended_at      = now(),
      suspended_by      = auth.uid(),
      updated_at        = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(
    _agency_id, 'disabled', _reason, before_snap, public._agency_snapshot(_agency_id)
  );

  RETURN updated_row;
END;
$$;

-- ─── set_agency_trial ──────────────────────────────────────────────────────
-- Puts agency into trial status with a hard end date. Pass NULL ends_at to
-- clear the date (open-ended trial).
CREATE OR REPLACE FUNCTION public.set_agency_trial(_agency_id uuid, _ends_at timestamptz)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET access_status = 'trial',
      trial_ends_at = _ends_at,
      suspension_reason = NULL,
      suspended_at = NULL,
      suspended_by = NULL,
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(
    _agency_id, 'trial_set', NULL, before_snap, public._agency_snapshot(_agency_id),
    jsonb_build_object('trial_ends_at', _ends_at)
  );

  RETURN updated_row;
END;
$$;

-- ─── update_agency_feature_flags ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_agency_feature_flags(_agency_id uuid, _flags jsonb)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET feature_flags = COALESCE(_flags, '{}'::jsonb),
      updated_at    = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(
    _agency_id, 'feature_flags_updated', NULL, before_snap, public._agency_snapshot(_agency_id)
  );

  RETURN updated_row;
END;
$$;

-- ─── update_agency_quotas ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_agency_quotas(_agency_id uuid, _quotas jsonb)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET quotas     = COALESCE(_quotas, '{}'::jsonb),
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(
    _agency_id, 'quotas_updated', NULL, before_snap, public._agency_snapshot(_agency_id)
  );

  RETURN updated_row;
END;
$$;

-- ─── update_agency_admin_notes ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_agency_admin_notes(_agency_id uuid, _notes text)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();

  UPDATE public.agencies
  SET admin_notes = _notes,
      updated_at  = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  RETURN updated_row;
END;
$$;

-- ─── list_agencies_for_admin ──────────────────────────────────────────────
-- Aggregated view for the /admin/agencies page.
CREATE OR REPLACE FUNCTION public.list_agencies_for_admin()
RETURNS TABLE (
  id                uuid,
  name              text,
  slug              text,
  owner_user_id     uuid,
  owner_email       text,
  access_status     text,
  effective_status  text,
  trial_ends_at     timestamptz,
  suspension_reason text,
  suspended_at      timestamptz,
  feature_flags     jsonb,
  quotas            jsonb,
  admin_notes       text,
  member_count      int,
  client_count      int,
  project_count     int,
  last_activity_at  timestamptz,
  created_at        timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._require_super_admin();

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.slug,
    a.owner_user_id,
    u.email::text                                 AS owner_email,
    a.access_status,
    public.agency_effective_status(a.id)          AS effective_status,
    a.trial_ends_at,
    a.suspension_reason,
    a.suspended_at,
    a.feature_flags,
    a.quotas,
    a.admin_notes,
    (SELECT COUNT(*)::int FROM public.agency_members am WHERE am.agency_id = a.id),
    (SELECT COUNT(*)::int FROM public.clients         c WHERE c.agency_id  = a.id),
    (SELECT COUNT(*)::int FROM public.projects        p WHERE p.agency_id  = a.id),
    GREATEST(
      a.updated_at,
      COALESCE((SELECT MAX(p.updated_at) FROM public.projects p WHERE p.agency_id = a.id), a.created_at)
    )                                              AS last_activity_at,
    a.created_at
  FROM public.agencies a
  LEFT JOIN auth.users u ON u.id = a.owner_user_id
  ORDER BY last_activity_at DESC NULLS LAST, a.created_at DESC;
END;
$$;

-- ─── get_agency_access_log ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_agency_access_log(_agency_id uuid, _limit int DEFAULT 50)
RETURNS TABLE (
  id            uuid,
  action        text,
  performed_by  uuid,
  performer_email text,
  reason        text,
  metadata      jsonb,
  before_state  jsonb,
  after_state   jsonb,
  created_at    timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Super admins or the owning agency may read
  IF NOT (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.agencies WHERE id = _agency_id AND owner_user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.action, l.performed_by, u.email::text, l.reason, l.metadata,
    l.before_state, l.after_state, l.created_at
  FROM public.agency_access_log l
  LEFT JOIN auth.users u ON u.id = l.performed_by
  WHERE l.agency_id = _agency_id
  ORDER BY l.created_at DESC
  LIMIT _limit;
END;
$$;

-- 5. RLS write-gates ---------------------------------------------------------
-- Block writes from agencies that don't have access. Super admins bypass.
-- Reads are allowed so the UI can render the suspension banner with context.

-- ─── clients ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "agency_members_can_write_clients" ON public.clients;
CREATE POLICY "agency_members_can_write_clients"
  ON public.clients FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

-- ─── projects ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "agency_members_can_write_projects" ON public.projects;
CREATE POLICY "agency_members_can_write_projects"
  ON public.projects FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

-- ─── knowledge_documents ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "agency_members_can_write_knowledge_documents" ON public.knowledge_documents;
CREATE POLICY "agency_members_can_write_knowledge_documents"
  ON public.knowledge_documents FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

-- ─── pending_invites (so suspended agencies can't invite new members) ─────
DROP POLICY IF EXISTS "agency_admins_can_invite_members" ON public.pending_invites;
CREATE POLICY "agency_admins_can_invite_members"
  ON public.pending_invites FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      invite_type = 'agency_member'
      AND agency_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.agency_members am
        WHERE am.agency_id = pending_invites.agency_id
          AND am.user_id = auth.uid()
          AND am.role IN ('owner','admin')
      )
      AND public.agency_has_access(agency_id)
    )
    OR (
      invite_type = 'super_admin'
      AND public.is_super_admin(auth.uid())
    )
  );

-- 6. Grants for client-side RPC calls ---------------------------------------
GRANT EXECUTE ON FUNCTION public.suspend_agency(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_agency(uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_agency(uuid, text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agency_trial(uuid, timestamptz)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_feature_flags(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_quotas(uuid, jsonb)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_admin_notes(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_agencies_for_admin()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_access_log(uuid, int)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_has_access(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_effective_status(uuid)           TO authenticated;
