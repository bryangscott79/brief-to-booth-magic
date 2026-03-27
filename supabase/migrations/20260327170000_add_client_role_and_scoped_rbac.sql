-- =========================================================
-- Migration: Add client role and company/project scoped RBAC
--
-- Extends the existing RBAC system with:
--   1. company_id on user_roles for company-scoped roles
--   2. project_assignments table (project-level access)
--   3. company_members table (company-level membership)
--   4. RLS policies for the new tables
--   5. Helper functions: is_company_member, has_project_access
--   6. Updated projects SELECT policy using has_project_access
--
-- Note: role column is TEXT (not enum). 'client' is a new
-- valid value alongside 'super_admin', 'admin', 'member'.
-- =========================================================


-- =========================================================
-- 2. Add company_id to user_roles for company-scoped roles
-- =========================================================

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_roles.company_id IS
  'Optional company scope — when set, the role applies only within this company';


-- =========================================================
-- 3. project_assignments — project-level access grants
-- =========================================================

CREATE TABLE IF NOT EXISTS public.project_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',
  assigned_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, user_id)
);

ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_project_assignments_user_id
  ON public.project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id
  ON public.project_assignments(project_id);


-- =========================================================
-- 4. company_members — company-level membership
-- =========================================================

CREATE TABLE IF NOT EXISTS public.company_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, user_id)
);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_company_members_user_id
  ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id
  ON public.company_members(company_id);


-- =========================================================
-- 5. Helper functions
-- =========================================================

-- Check if a user belongs to a company
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id
  );
$$;

-- Check if a user has access to a project
-- Access granted via: ownership, direct assignment, or super_admin role
CREATE OR REPLACE FUNCTION public.has_project_access(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Project owner
    SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = _user_id
  ) OR EXISTS (
    -- Direct project assignment
    SELECT 1 FROM public.project_assignments
    WHERE user_id = _user_id AND project_id = _project_id
  ) OR public.has_role(_user_id, 'super_admin');
$$;


-- =========================================================
-- 6. RLS policies for project_assignments
-- =========================================================

-- Super admins: full access
CREATE POLICY "Super admins can manage all project assignments"
  ON public.project_assignments FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Admins: can view/manage assignments for projects in their company
CREATE POLICY "Admins can view project assignments in their company"
  ON public.project_assignments FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.company_members cm ON cm.company_id = p.client_id
      WHERE p.id = project_assignments.project_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert project assignments in their company"
  ON public.project_assignments FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.company_members cm ON cm.company_id = p.client_id
      WHERE p.id = project_assignments.project_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete project assignments in their company"
  ON public.project_assignments FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.company_members cm ON cm.company_id = p.client_id
      WHERE p.id = project_assignments.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- Users can see their own assignments
CREATE POLICY "Users can view own project assignments"
  ON public.project_assignments FOR SELECT
  USING (auth.uid() = user_id);

-- Project owners can manage assignments on their projects
CREATE POLICY "Project owners can insert assignments"
  ON public.project_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_assignments.project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Project owners can delete assignments"
  ON public.project_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_assignments.project_id AND user_id = auth.uid()
    )
  );


-- =========================================================
-- 7. RLS policies for company_members
-- =========================================================

-- Super admins: full access
CREATE POLICY "Super admins can manage all company members"
  ON public.company_members FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Admins: view/manage members in their own company
CREATE POLICY "Admins can view company members in own company"
  ON public.company_members FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.company_members cm2
      WHERE cm2.company_id = company_members.company_id
        AND cm2.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert company members in own company"
  ON public.company_members FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.company_members cm2
      WHERE cm2.company_id = company_members.company_id
        AND cm2.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete company members in own company"
  ON public.company_members FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.company_members cm2
      WHERE cm2.company_id = company_members.company_id
        AND cm2.user_id = auth.uid()
    )
  );

-- Users can see their own memberships
CREATE POLICY "Users can view own company memberships"
  ON public.company_members FOR SELECT
  USING (auth.uid() = user_id);


-- =========================================================
-- 8. Update projects SELECT policy to include project_assignments
--
-- The original policy "Users can view their own projects" only
-- checks auth.uid() = user_id. We replace it with a broader
-- policy that also grants access via project_assignments and
-- admin/super_admin roles.
-- =========================================================

DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;

CREATE POLICY "Users can view accessible projects" ON public.projects
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.project_assignments
      WHERE project_id = projects.id AND user_id = auth.uid()
    )
  );
