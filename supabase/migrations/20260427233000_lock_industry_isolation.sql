-- =========================================================================
-- LOCK INDUSTRY ISOLATION
--
-- Product rules:
--   1. An agency is bound to its industry/industries at onboarding.
--      Once set, only super admins can change them.
--   2. Activation/project types from one industry must not appear for
--      agencies in another industry.
--      (RLS + UI filters already enforce this for built-ins; agency-
--      created custom types must auto-tag with the agency's industries
--      so they too remain isolated.)
--
-- This migration tightens (1) by dropping the user-callable
-- update_my_agency_industries RPC and replacing it with a super-admin-
-- only admin_set_agency_industries.
--
-- (2) is enforced at the application layer by the activation_types
-- create flow tagging new types with the agency's industries[].
-- =========================================================================

-- 1. Drop the user-callable industry-update RPC ------------------------------
DROP FUNCTION IF EXISTS public.update_my_agency_industries(text, text[]);

-- 2. Super-admin-only replacement -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_agency_industries(
  _agency_id        uuid,
  _primary_industry text,
  _industries       text[]
)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  resolved_primary    text;
  resolved_industries text[];
  updated_row         public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();

  resolved_primary := coalesce(_primary_industry, 'experiential');
  IF NOT EXISTS (SELECT 1 FROM public.industries WHERE slug = resolved_primary) THEN
    RAISE EXCEPTION 'Unknown industry: %', resolved_primary USING ERRCODE = '22023';
  END IF;

  resolved_industries := coalesce(_industries, ARRAY[resolved_primary]);
  IF NOT (resolved_primary = ANY(resolved_industries)) THEN
    resolved_industries := array_append(resolved_industries, resolved_primary);
  END IF;
  resolved_industries := ARRAY(
    SELECT s FROM unnest(resolved_industries) s
    WHERE EXISTS (SELECT 1 FROM public.industries WHERE slug = s)
  );

  UPDATE public.agencies
  SET primary_industry = resolved_primary,
      industries       = resolved_industries,
      updated_at       = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_agency_industries(uuid, text, text[]) TO authenticated;

COMMENT ON FUNCTION public.admin_set_agency_industries(uuid, text, text[]) IS
  'Super-admin-only override for an agency''s industries. Agency users ' ||
  'cannot change their own industries after onboarding.';

-- 3. Belt-and-suspenders: trigger that prevents agency-side
--    industry changes after the row was created with a non-null primary.
--    Super admins (SECURITY DEFINER RPCs) bypass via SET LOCAL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._block_industry_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  -- Allow when caller is a super admin (server-trusted).
  IF caller IS NOT NULL AND public.is_super_admin(caller) THEN
    RETURN NEW;
  END IF;

  -- Allow first-time set (transition from NULL to a value happens during
  -- onboarding via create_my_agency, which runs SECURITY DEFINER).
  IF OLD.primary_industry IS NULL AND NEW.primary_industry IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Block agency-side mutation of primary_industry or industries[].
  IF NEW.primary_industry IS DISTINCT FROM OLD.primary_industry THEN
    RAISE EXCEPTION 'primary_industry is locked once set; contact a platform admin to change it'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.industries IS DISTINCT FROM OLD.industries THEN
    RAISE EXCEPTION 'agency industries are locked once set; contact a platform admin to change them'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_agency_industries ON public.agencies;
CREATE TRIGGER trg_lock_agency_industries
  BEFORE UPDATE OF primary_industry, industries ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public._block_industry_self_change();
