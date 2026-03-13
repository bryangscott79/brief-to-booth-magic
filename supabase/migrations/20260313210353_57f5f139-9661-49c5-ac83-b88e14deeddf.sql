
-- Create team_members table
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  team_owner_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'designer', 'viewer')),
  display_name TEXT NOT NULL DEFAULT '',
  invited_email TEXT,
  invited_by UUID,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team owners can manage their team" ON public.team_members
  FOR ALL USING (auth.uid() = team_owner_id);

CREATE POLICY "Team members can view their memberships" ON public.team_members
  FOR SELECT USING (auth.uid() = user_id);

-- Create project_invites table
CREATE TABLE IF NOT EXISTS public.project_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  email TEXT,
  scope TEXT NOT NULL DEFAULT 'view_comment' CHECK (scope IN ('upload_only', 'view_comment', 'full_edit')),
  label TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  accepted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project owners can manage invites" ON public.project_invites
  FOR ALL USING (auth.uid() = created_by);

CREATE POLICY "Anyone can read invite by token" ON public.project_invites
  FOR SELECT USING (true);

-- Create rhino_renders table
CREATE TABLE IF NOT EXISTS public.rhino_renders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  original_storage_path TEXT NOT NULL,
  original_public_url TEXT NOT NULL,
  polished_storage_path TEXT,
  polished_public_url TEXT,
  polish_status TEXT NOT NULL DEFAULT 'uploaded' CHECK (polish_status IN ('uploaded', 'processing', 'complete', 'error')),
  polish_prompt TEXT,
  polish_feedback TEXT,
  view_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rhino_renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own rhino renders" ON public.rhino_renders
  FOR ALL USING (auth.uid() = user_id);

-- Create storage bucket for rhino renders
INSERT INTO storage.buckets (id, name, public) 
VALUES ('rhino-renders', 'rhino-renders', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload rhino renders" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'rhino-renders' AND auth.uid() IS NOT NULL);

CREATE POLICY "Rhino renders are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'rhino-renders');

CREATE POLICY "Users can delete their own rhino renders" ON storage.objects
  FOR DELETE USING (bucket_id = 'rhino-renders' AND auth.uid() IS NOT NULL);
