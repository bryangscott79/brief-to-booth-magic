
-- Drop the old function so it doesn't block the new one later
DROP FUNCTION IF EXISTS public.get_all_user_profiles();

-- Recreate using text comparison to avoid enum casting issue until enum is committed
CREATE FUNCTION public.get_all_user_profiles()
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  is_admin boolean,
  is_super_admin boolean,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.user_id,
    p.email,
    p.display_name,
    p.avatar_url,
    EXISTS(
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id AND ur.role::text = 'admin'
    ) AS is_admin,
    EXISTS(
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id AND ur.role::text = 'super_admin'
    ) AS is_super_admin,
    p.created_at
  FROM public.profiles p
  WHERE
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS(
      SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id = auth.uid() AND ur2.role::text = 'super_admin'
    )
  ORDER BY p.created_at ASC;
$$;

-- Update projects RLS so super_admin can also view all
DROP POLICY IF EXISTS "Admins can view all projects" ON public.projects;
CREATE POLICY "Admins can view all projects" ON public.projects
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  );

-- Update profiles RLS so super_admin can also view/update all
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  );

-- Update platform_invites RLS
DROP POLICY IF EXISTS "Admins can manage platform invites" ON public.platform_invites;
CREATE POLICY "Admins can manage platform invites" ON public.platform_invites
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  );

-- Update user_roles RLS — only super_admin can insert/delete roles
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
    OR (auth.uid() = user_id)
  );

CREATE POLICY "Super admins can insert roles" ON public.user_roles
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  );

CREATE POLICY "Super admins can delete roles" ON public.user_roles
  FOR DELETE USING (
    EXISTS(
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'super_admin'
    )
  );
