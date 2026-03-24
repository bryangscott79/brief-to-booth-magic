ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS activation_type TEXT,
  ADD COLUMN IF NOT EXISTS scale_classification TEXT,
  ADD COLUMN IF NOT EXISTS footprint_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS inherits_brief BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inherits_brand BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS suite_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_parent_id ON public.projects(parent_id);