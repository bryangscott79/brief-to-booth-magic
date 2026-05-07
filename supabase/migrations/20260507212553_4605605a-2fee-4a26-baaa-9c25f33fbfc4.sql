-- Restore agency access-control columns expected by the admin UI.
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by uuid,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quotas jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS admin_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agencies_access_status_check'
      AND conrelid = 'public.agencies'::regclass
  ) THEN
    ALTER TABLE public.agencies
      ADD CONSTRAINT agencies_access_status_check
      CHECK (access_status IN ('active','trial','suspended','disabled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agencies_access_status_idx ON public.agencies(access_status);
CREATE INDEX IF NOT EXISTS agencies_trial_ends_at_idx ON public.agencies(trial_ends_at) WHERE trial_ends_at IS NOT NULL;

-- Compatibility wrappers used by policies and RPCs.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_agency_member(_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_agency_member(_agency_id, auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin(_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_agency_admin(_agency_id, auth.uid())
$$;

-- Super-admin guard.
CREATE OR REPLACE FUNCTION public._require_super_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: super admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Effective access helpers.
CREATE OR REPLACE FUNCTION public.agency_has_access(_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agencies
    WHERE id = _agency_id
      AND access_status IN ('active','trial')
      AND (trial_ends_at IS NULL OR trial_ends_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.agency_effective_status(_agency_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN access_status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at <= now()
      THEN 'trial_expired'
    ELSE access_status
  END
  FROM public.agencies
  WHERE id = _agency_id
$$;

-- Audit log for agency access changes.
CREATE TABLE IF NOT EXISTS public.agency_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_access_log_agency_idx ON public.agency_access_log(agency_id, created_at DESC);
ALTER TABLE public.agency_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins see all access logs" ON public.agency_access_log;
CREATE POLICY "Super admins see all access logs"
  ON public.agency_access_log
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners see their agency access log" ON public.agency_access_log;
CREATE POLICY "Owners see their agency access log"
  ON public.agency_access_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agencies a
      WHERE a.id = agency_access_log.agency_id
        AND a.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Only system writes access log" ON public.agency_access_log;
CREATE POLICY "Only system writes access log"
  ON public.agency_access_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public._agency_snapshot(_agency_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'access_status', access_status,
    'trial_ends_at', trial_ends_at,
    'suspension_reason', suspension_reason,
    'feature_flags', feature_flags,
    'quotas', quotas,
    'admin_notes', admin_notes
  )
  FROM public.agencies
  WHERE id = _agency_id
$$;

CREATE OR REPLACE FUNCTION public._log_agency_access(
  _agency_id uuid,
  _action text,
  _reason text,
  _before jsonb,
  _after jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.suspend_agency(_agency_id uuid, _reason text DEFAULT NULL)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET access_status = 'suspended',
      suspension_reason = _reason,
      suspended_at = now(),
      suspended_by = auth.uid(),
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(_agency_id, 'suspended', _reason, before_snap, public._agency_snapshot(_agency_id));
  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_agency(_agency_id uuid, _reason text DEFAULT NULL)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET access_status = 'active',
      suspension_reason = NULL,
      suspended_at = NULL,
      suspended_by = NULL,
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(_agency_id, 'reactivated', _reason, before_snap, public._agency_snapshot(_agency_id));
  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_agency(_agency_id uuid, _reason text DEFAULT NULL)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET access_status = 'disabled',
      suspension_reason = _reason,
      suspended_at = now(),
      suspended_by = auth.uid(),
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(_agency_id, 'disabled', _reason, before_snap, public._agency_snapshot(_agency_id));
  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agency_trial(_agency_id uuid, _ends_at timestamptz)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    _agency_id,
    'trial_set',
    NULL,
    before_snap,
    public._agency_snapshot(_agency_id),
    jsonb_build_object('trial_ends_at', _ends_at)
  );

  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_feature_flags(_agency_id uuid, _flags jsonb)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET feature_flags = COALESCE(_flags, '{}'::jsonb),
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(_agency_id, 'feature_flags_updated', NULL, before_snap, public._agency_snapshot(_agency_id));
  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_quotas(_agency_id uuid, _quotas jsonb)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET quotas = COALESCE(_quotas, '{}'::jsonb),
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(_agency_id, 'quotas_updated', NULL, before_snap, public._agency_snapshot(_agency_id));
  RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_admin_notes(_agency_id uuid, _notes text)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_snap jsonb;
  updated_row public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  before_snap := public._agency_snapshot(_agency_id);

  UPDATE public.agencies
  SET admin_notes = _notes,
      updated_at = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  PERFORM public._log_agency_access(_agency_id, 'admin_notes_updated', NULL, before_snap, public._agency_snapshot(_agency_id));
  RETURN updated_row;
END;
$$;

-- Aggregated view for /admin/agencies. This version is compatible with the current projects table,
-- which stores projects by user_id rather than agency_id.
CREATE OR REPLACE FUNCTION public.list_agencies_for_admin()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  owner_user_id uuid,
  owner_email text,
  access_status text,
  effective_status text,
  trial_ends_at timestamptz,
  suspension_reason text,
  suspended_at timestamptz,
  feature_flags jsonb,
  quotas jsonb,
  admin_notes text,
  member_count int,
  client_count int,
  project_count int,
  last_activity_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._require_super_admin();

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.slug,
    a.owner_user_id,
    COALESCE(p.email, u.email)::text AS owner_email,
    a.access_status,
    public.agency_effective_status(a.id) AS effective_status,
    a.trial_ends_at,
    a.suspension_reason,
    a.suspended_at,
    a.feature_flags,
    a.quotas,
    a.admin_notes,
    (SELECT COUNT(*)::int FROM public.agency_members am WHERE am.agency_id = a.id) AS member_count,
    (SELECT COUNT(*)::int FROM public.clients c WHERE c.agency_id = a.id) AS client_count,
    (
      SELECT COUNT(DISTINCT pr.id)::int
      FROM public.projects pr
      WHERE pr.user_id IN (
        SELECT am2.user_id
        FROM public.agency_members am2
        WHERE am2.agency_id = a.id
      )
    ) AS project_count,
    GREATEST(
      a.updated_at,
      COALESCE((
        SELECT MAX(pr.updated_at)
        FROM public.projects pr
        WHERE pr.user_id IN (
          SELECT am3.user_id
          FROM public.agency_members am3
          WHERE am3.agency_id = a.id
        )
      ), a.created_at)
    ) AS last_activity_at,
    a.created_at
  FROM public.agencies a
  LEFT JOIN public.profiles p ON p.user_id = a.owner_user_id
  LEFT JOIN auth.users u ON u.id = a.owner_user_id
  ORDER BY last_activity_at DESC NULLS LAST, a.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_agency_access_log(_agency_id uuid, _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  action text,
  performed_by uuid,
  performer_email text,
  reason text,
  metadata jsonb,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.agencies a
      WHERE a.id = _agency_id
        AND a.owner_user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.action,
    l.performed_by,
    COALESCE(p.email, u.email)::text AS performer_email,
    l.reason,
    l.metadata,
    l.before_state,
    l.after_state,
    l.created_at
  FROM public.agency_access_log l
  LEFT JOIN public.profiles p ON p.user_id = l.performed_by
  LEFT JOIN auth.users u ON u.id = l.performed_by
  WHERE l.agency_id = _agency_id
  ORDER BY l.created_at DESC
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_has_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_effective_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_agency(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_agency(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_agency(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_agency_trial(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_feature_flags(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_quotas(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agency_admin_notes(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_agencies_for_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_access_log(uuid, int) TO authenticated;