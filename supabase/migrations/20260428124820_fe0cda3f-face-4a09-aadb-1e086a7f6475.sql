-- Canopy: industries + activation-type tagging + agency industry fields (idempotent)

CREATE TABLE IF NOT EXISTS public.industries (
  slug         text PRIMARY KEY,
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  description  text,
  icon         text,
  vocabulary   jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order   int NOT NULL DEFAULT 100,
  is_builtin   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industries_id_key ON public.industries(id);

ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read industries" ON public.industries;
CREATE POLICY "Authenticated can read industries"
  ON public.industries FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admins can manage industries" ON public.industries;
CREATE POLICY "Super admins can manage industries"
  ON public.industries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role::text = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid() AND role::text = 'super_admin'
    )
  );

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS primary_industry text,
  ADD COLUMN IF NOT EXISTS industries       text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS agencies_primary_industry_idx
  ON public.agencies(primary_industry);

CREATE INDEX IF NOT EXISTS agencies_industries_gin_idx
  ON public.agencies USING gin (industries);

ALTER TABLE public.activation_types
  ADD COLUMN IF NOT EXISTS industries text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS activation_types_industries_gin_idx
  ON public.activation_types USING gin (industries);

UPDATE public.activation_types
   SET industries = ARRAY['experiential']
 WHERE is_builtin = true
   AND (industries IS NULL OR cardinality(industries) = 0);

INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order, is_builtin)
VALUES
  ('experiential',  'Experiential & Trade Show',
   'Brand activations, trade show booths, pop-ups, event marketing.',
   'Sparkles',
   '{"project_type":"Activation type","project_types":"Activation types","project":"Activation","projects":"Activations","deliverable":"Render package","render":"Booth render","spatial_plan":"Floor plan","brief":"Brief","client":"Client"}'::jsonb,
   10, true),
  ('architecture',  'Architecture & Construction',
   'Residential, commercial, hospitality, and civic buildings — new builds and renovations.',
   'Building2',
   '{"project_type":"Project type","project_types":"Project types","project":"Project","projects":"Projects","deliverable":"Drawing set","render":"Architectural rendering","spatial_plan":"Floor plan","brief":"Project brief","client":"Client"}'::jsonb,
   20, true),
  ('landscape',     'Landscape & Site Design',
   'Gardens, parks, plazas, streetscapes, restoration, and site planning.',
   'TreePine',
   '{"project_type":"Project type","project_types":"Project types","project":"Site","projects":"Sites","deliverable":"Site plan package","render":"Site rendering","spatial_plan":"Site plan","brief":"Site brief","client":"Client"}'::jsonb,
   30, true),
  ('entertainment', 'Entertainment & Production',
   'Film, TV, theatrical, themed entertainment, concerts, and live events.',
   'Film',
   '{"project_type":"Production type","project_types":"Production types","project":"Production","projects":"Productions","deliverable":"Set design package","render":"Set rendering","spatial_plan":"Stage plan","brief":"Production brief","client":"Production company"}'::jsonb,
   40, true),
  ('audio_visual',  'A/V Integration & Install',
   'Audio-visual systems for corporate, hospitality, education, worship, residential.',
   'Speaker',
   '{"project_type":"System type","project_types":"System types","project":"Install","projects":"Installs","deliverable":"Equipment list & layout","render":"System rendering","spatial_plan":"Equipment layout","brief":"Scope of work","client":"Client"}'::jsonb,
   50, true)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS industries_touch_updated_at ON public.industries;
CREATE TRIGGER industries_touch_updated_at
  BEFORE UPDATE ON public.industries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
