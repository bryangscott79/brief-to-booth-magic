ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS image_model text NOT NULL DEFAULT 'google/gemini-3-pro-image-preview';

COMMENT ON COLUMN public.agencies.image_model IS
  'Default image-generation model for this agency. Per-render overrides allowed in the UI.';