-- Add project_type column to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'trade_show_booth';

-- Add a check constraint to ensure valid project types (extensible via ALTER in future)
ALTER TABLE public.projects 
ADD CONSTRAINT projects_project_type_check 
CHECK (project_type IN (
  'trade_show_booth',
  'live_brand_activation', 
  'permanent_installation',
  'film_premiere',
  'game_release_activation',
  'architectural_brief'
));

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_projects_project_type ON public.projects(project_type);
