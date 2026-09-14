-- Three new project-scoped surfaces (2026-09-14):
--   planning_canvas        · post-brief chat + concept board
--   blender_jobs           · headless Blender model builds
--   client_feedback_rounds · post-export client feedback → render iteration
--
-- All follow the project_decks contract: the project's owner (and super
-- admins) read/write. Run in the Supabase SQL editor for project
-- kjbamfitkaxnfyppplaq, or via Lovable. Every surface degrades gracefully
-- (localStorage / disabled UI) until this is applied.

-- ── planning_canvas ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planning_canvas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  /** Chat turns: [{ id, role, content, cardIds?, createdAt }] */
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Concept cards: [{ id, imageUrl, storagePath, prompt, label, pinned,
   *  favorite, notes, angleId?, createdAt }] */
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Free-form board state (grouping, ordering, filters). */
  board jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── blender_jobs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blender_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  /** Booth size this build represents (sanitized config key). */
  config_key text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  /** The generated Blender python, stored so a build is reproducible. */
  script text,
  script_url text,
  blend_url text,
  gltf_url text,
  /** Rendered stills returned by the service: [{ url, label }] */
  preview_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Job id inside the external Blender service, for polling. */
  external_job_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blender_jobs_project ON public.blender_jobs (project_id, created_at DESC);

-- ── client_feedback_rounds ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_feedback_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  label text,
  /** Pasted / typed client feedback, verbatim. */
  raw_feedback text,
  /** Dropped files (marked-up screenshots, docs): [{ url, path, name, kind }] */
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Parsed revision items: [{ id, angleId, imageUrl, instruction, scope,
   *  status: pending|applied|skipped, resultImageUrl? }] */
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'parsed', 'applying', 'applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_feedback_project ON public.client_feedback_rounds (project_id, created_at DESC);

-- ── triggers ────────────────────────────────────────────────────────────────
CREATE TRIGGER update_planning_canvas_updated_at
  BEFORE UPDATE ON public.planning_canvas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_blender_jobs_updated_at
  BEFORE UPDATE ON public.blender_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_client_feedback_rounds_updated_at
  BEFORE UPDATE ON public.client_feedback_rounds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS (same contract as project_decks) ────────────────────────────────────
ALTER TABLE public.planning_canvas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blender_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_feedback_rounds ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.planning_canvas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blender_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_feedback_rounds TO authenticated;
GRANT ALL ON public.planning_canvas TO service_role;
GRANT ALL ON public.blender_jobs TO service_role;
GRANT ALL ON public.client_feedback_rounds TO service_role;

CREATE POLICY planning_canvas_rw ON public.planning_canvas
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = planning_canvas.project_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = planning_canvas.project_id AND p.user_id = auth.uid())
  );

CREATE POLICY blender_jobs_rw ON public.blender_jobs
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = blender_jobs.project_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = blender_jobs.project_id AND p.user_id = auth.uid())
  );

CREATE POLICY client_feedback_rounds_rw ON public.client_feedback_rounds
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = client_feedback_rounds.project_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = client_feedback_rounds.project_id AND p.user_id = auth.uid())
  );