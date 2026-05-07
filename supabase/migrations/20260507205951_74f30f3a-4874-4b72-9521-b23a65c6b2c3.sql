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
    a.id, a.name, a.slug, a.owner_user_id,
    u.email::text,
    a.access_status,
    public.agency_effective_status(a.id),
    a.trial_ends_at, a.suspension_reason, a.suspended_at,
    a.feature_flags, a.quotas, a.admin_notes,
    (SELECT COUNT(*)::int FROM public.agency_members am WHERE am.agency_id = a.id),
    (SELECT COUNT(*)::int FROM public.clients         c  WHERE c.agency_id  = a.id),
    (SELECT COUNT(*)::int FROM public.projects        p  WHERE p.agency_id  = a.id),
    GREATEST(
      a.updated_at,
      COALESCE((SELECT MAX(p.updated_at) FROM public.projects p WHERE p.agency_id = a.id), a.created_at)
    ),
    a.created_at
  FROM public.agencies a
  LEFT JOIN auth.users u ON u.id = a.owner_user_id
  ORDER BY last_activity_at DESC NULLS LAST, a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_agencies_for_admin() TO authenticated;