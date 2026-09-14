-- Move the render engine to the new flagship image model (2026-09-14).
--
-- Adding the tier in code isn't enough: agencies.image_model already holds
-- the previous default on every existing row, so those agencies would keep
-- routing to the old engine forever. This moves rows that still carry the
-- OLD DEFAULT and leaves deliberately-chosen tiers alone, then updates the
-- column default for agencies created from here on.
--
-- Idempotent. Run in the Supabase SQL editor (project kjbamfitkaxnfyppplaq).

UPDATE public.agencies
SET image_model = 'openai/gpt-image-2.5'
WHERE image_model IS NULL
   OR image_model = 'google/gemini-3-pro-image-preview';

ALTER TABLE public.agencies
  ALTER COLUMN image_model SET DEFAULT 'openai/gpt-image-2.5';

-- Verify: every agency and which engine it routes to
SELECT name, slug, image_model FROM public.agencies ORDER BY name;
