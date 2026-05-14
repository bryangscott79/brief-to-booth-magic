-- supabase/migrations/20260514000000_prompt_artifacts.sql
--
-- Add prompt_artifacts JSONB column to project_images so we can persist
-- the full ComposerOutput (5 stages: briefJson, geometrySummary,
-- renderer, negative, compliance) alongside each render. Used as the
-- heroSnapshot contract — auxiliary views read from project_images
-- where angle_id = 'hero_34' and pull the snapshot for composition.

ALTER TABLE public.project_images
  ADD COLUMN IF NOT EXISTS prompt_artifacts JSONB;

COMMENT ON COLUMN public.project_images.prompt_artifacts IS
  'ComposerOutput JSON for this render — { briefJson, geometrySummary, renderer, negative, compliance }. Hero renders also include the normalized brief snapshot, used as heroSnapshot by auxiliary view composition.';
