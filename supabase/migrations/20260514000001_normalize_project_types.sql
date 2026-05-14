-- supabase/migrations/20260514000001_normalize_project_types.sql
--
-- Migrate project_type column to the 5 canonical values:
--   exhibition_booth | brand_activation | permanent_interior |
--   retail_environment | architectural_installation
-- Old values map forward; film_premiere + game_release_activation
-- collapse into brand_activation as the closest fit.
--
-- The application's normalizer (src/lib/normalizedBrief.ts ::
-- projectTypeOrDefault) ALREADY handles legacy values defensively, so
-- this migration is data-cleanliness — not strictly required for the
-- new pipeline to function. UI surfaces that still reference legacy
-- type strings (~13 files at time of writing) will be updated in a
-- follow-on cleanup; until then they fall through to default
-- behavior when reading migrated rows.

UPDATE public.projects SET project_type = CASE project_type
  WHEN 'trade_show_booth'         THEN 'exhibition_booth'
  WHEN 'live_brand_activation'    THEN 'brand_activation'
  WHEN 'permanent_installation'   THEN 'permanent_interior'
  WHEN 'architectural_brief'      THEN 'architectural_installation'
  WHEN 'film_premiere'            THEN 'brand_activation'
  WHEN 'game_release_activation'  THEN 'brand_activation'
  ELSE project_type
END
WHERE project_type IN (
  'trade_show_booth',
  'live_brand_activation',
  'permanent_installation',
  'architectural_brief',
  'film_premiere',
  'game_release_activation'
);

-- Drop the old CHECK constraint if it exists; add the new one.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN (
    'exhibition_booth',
    'brand_activation',
    'permanent_interior',
    'retail_environment',
    'architectural_installation'
  ));
