CREATE TABLE IF NOT EXISTS public.project_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_decks TO authenticated;
GRANT ALL ON public.project_decks TO service_role;

ALTER TABLE public.project_decks ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_project_decks_updated_at ON public.project_decks;
CREATE TRIGGER update_project_decks_updated_at
  BEFORE UPDATE ON public.project_decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS project_decks_rw ON public.project_decks;
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

CREATE INDEX IF NOT EXISTS idx_project_decks_project_id ON public.project_decks(project_id);