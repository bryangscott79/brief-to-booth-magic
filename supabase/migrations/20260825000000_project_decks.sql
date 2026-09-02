-- Deck persistence + brand settings for the export step.
-- One row per project: the chosen brand mode & kit snapshot (settings) and
-- the compiled slide content (content). Replaces localStorage-only decks so
-- decks survive devices and are shared with teammates.
--
-- Run in the Supabase SQL editor (project kjbamfitkaxnfyppplaq) or via
-- Lovable. The frontend falls back to localStorage until this exists.

CREATE TABLE IF NOT EXISTS public.project_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_project_decks_updated_at
  BEFORE UPDATE ON public.project_decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.project_decks ENABLE ROW LEVEL SECURITY;

-- Same visibility contract as projects: the project's owner (and super
-- admins) read and write the deck.
CREATE POLICY project_decks_rw ON public.project_decks
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_decks.project_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_decks.project_id AND p.user_id = auth.uid()
    )
  );
