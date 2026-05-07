CREATE OR REPLACE FUNCTION public.list_agency_members(_agency_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz,
  is_primary_owner boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    am.id,
    am.user_id,
    COALESCE(p.email, '')::text AS email,
    am.role,
    am.joined_at,
    (a.owner_user_id = am.user_id) AS is_primary_owner
  FROM public.agency_members am
  JOIN public.agencies a ON a.id = am.agency_id
  LEFT JOIN public.profiles p ON p.user_id = am.user_id
  WHERE am.agency_id = _agency_id
    AND (
      public.is_agency_member(_agency_id, auth.uid())
      OR public.is_super_admin(auth.uid())
    )
  ORDER BY am.joined_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_agency_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_agency_members(uuid) TO authenticated;