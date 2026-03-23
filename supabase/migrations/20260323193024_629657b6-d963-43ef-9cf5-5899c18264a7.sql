
-- Fix infinite recursion in user_roles RLS policies
-- The problem: policies on user_roles were using EXISTS(SELECT 1 FROM user_roles ...)
-- which causes infinite recursion. All policies must use has_role() SECURITY DEFINER instead.

-- Drop all existing user_roles policies
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can insert roles" ON public.user_roles;

-- Also fix the profiles policies that reference user_roles directly
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Fix platform_invites policy
DROP POLICY IF EXISTS "Admins can manage platform invites" ON public.platform_invites;

-- Fix projects policy
DROP POLICY IF EXISTS "Admins can view all projects" ON public.projects;

-- Recreate user_roles policies using ONLY has_role() (SECURITY DEFINER, bypasses RLS)
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Super admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Recreate profiles policies using has_role() only
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Recreate platform_invites policy
CREATE POLICY "Admins can manage platform invites"
  ON public.platform_invites FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Recreate projects admin policy
CREATE POLICY "Admins can view all projects"
  ON public.projects FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
