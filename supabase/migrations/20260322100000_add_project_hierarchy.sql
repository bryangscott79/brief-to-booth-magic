-- =========================================================
-- Phase 0A: Foundation — user_roles table + has_role()
-- =========================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- =========================================================
-- Phase 0B: Foundation — clients table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  industry TEXT,
  website TEXT,
  notes TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clients"
  ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clients"
  ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clients"
  ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clients"
  ON public.clients FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all clients"
  ON public.clients FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Phase 0C: Foundation — brand_intelligence table
-- =========================================================

CREATE TABLE IF NOT EXISTS public.brand_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  user_id UUID NOT NULL,
  metadata JSONB,
  relevance_weight NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.brand_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand intelligence"
  ON public.brand_intelligence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own brand intelligence"
  ON public.brand_intelligence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own brand intelligence"
  ON public.brand_intelligence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own brand intelligence"
  ON public.brand_intelligence FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all brand intelligence"
  ON public.brand_intelligence FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Phase 0D: Add client_id and user_id to projects
-- =========================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- =========================================================
-- Phase 1A: Add hierarchy columns to projects table
-- Enables parent/child "Activation Suite" relationships.
-- All columns nullable — existing projects unchanged.
-- =========================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activation_type TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inherits_brief BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS inherits_brand BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS scale_classification TEXT,
  ADD COLUMN IF NOT EXISTS footprint_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS suite_notes TEXT;

-- Constrain scale values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_scale_classification_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_scale_classification_check
      CHECK (scale_classification IS NULL OR scale_classification IN (
        'tabletop','inline','peninsula','island','large_island','mega','custom'
      ));
  END IF;
END $$;

-- Index for parent/child lookups
CREATE INDEX IF NOT EXISTS idx_projects_parent_id
  ON public.projects(parent_id) WHERE parent_id IS NOT NULL;

-- =========================================================
-- Phase 1B: Activation types taxonomy
-- =========================================================

CREATE TABLE IF NOT EXISTS public.activation_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT NOT NULL,
  parent_type_affinity TEXT[],
  default_scale TEXT,
  default_sqft INTEGER,
  element_emphasis JSONB,
  render_context_override TEXT,
  is_builtin BOOLEAN DEFAULT true,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.activation_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read builtin activation types"
  ON public.activation_types FOR SELECT
  USING (is_builtin = true);

CREATE POLICY "Users can manage own custom activation types"
  ON public.activation_types FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all activation types"
  ON public.activation_types FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed 15 built-in activation types
INSERT INTO public.activation_types (slug, label, description, icon, category, parent_type_affinity, default_scale, default_sqft, element_emphasis) VALUES
  ('satellite_kiosk', 'Satellite Kiosk', 'Small standalone information or engagement point near main activation', '📍', 'engagement', ARRAY['trade_show_booth','live_brand_activation','game_release_activation'], 'inline', 100, '{"bigIdea":"inherit","spatialStrategy":"required","budgetLogic":"required","interactiveMechanics":"required"}'),
  ('demo_station', 'Demo Station', 'Dedicated product demonstration or hands-on experience area', '🖥️', 'engagement', ARRAY['trade_show_booth','game_release_activation','permanent_installation'], 'tabletop', 64, '{"interactiveMechanics":"required","digitalStorytelling":"required","bigIdea":"inherit"}'),
  ('product_launch_zone', 'Product Launch Zone', 'Dedicated area for product reveals, demonstrations, and launch moments', '🚀', 'engagement', ARRAY['trade_show_booth','live_brand_activation','film_premiere','game_release_activation'], 'peninsula', 400, '{"bigIdea":"required","interactiveMechanics":"required","digitalStorytelling":"required"}'),
  ('social_media_moment', 'Social Media / Photo Moment', 'Instagram-worthy photo opportunity or social capture installation', '📸', 'engagement', ARRAY['trade_show_booth','live_brand_activation','film_premiere','game_release_activation'], 'inline', 100, '{"interactiveMechanics":"required","digitalStorytelling":"required","bigIdea":"inherit"}'),
  ('merch_retail', 'Merch / Retail Pop-Up', 'Merchandise sales, collectible drops, or temporary retail experience', '🛍️', 'engagement', ARRAY['live_brand_activation','film_premiere','game_release_activation'], 'inline', 200, '{"budgetLogic":"required","spatialStrategy":"required","bigIdea":"inherit"}'),
  ('vip_lounge', 'VIP Lounge', 'Exclusive hospitality space for VIPs, executives, or top-tier guests', '🥂', 'hospitality', ARRAY['trade_show_booth','live_brand_activation','film_premiere','game_release_activation'], 'island', 600, '{"humanConnection":"required","spatialStrategy":"required","budgetLogic":"required","bigIdea":"inherit"}'),
  ('hospitality_suite', 'Hospitality Suite', 'Off-floor or adjacent private hospitality area for client entertainment', '🏨', 'hospitality', ARRAY['trade_show_booth','live_brand_activation','film_premiere'], 'custom', 1000, '{"humanConnection":"required","adjacentActivations":"required","budgetLogic":"required","bigIdea":"inherit"}'),
  ('meeting_room', 'Meeting Room / Conference', 'Private meeting or conference space within or adjacent to main activation', '🤝', 'hospitality', ARRAY['trade_show_booth','permanent_installation','architectural_brief'], 'inline', 150, '{"humanConnection":"required","spatialStrategy":"required","bigIdea":"inherit"}'),
  ('reception_area', 'Reception / Registration', 'Check-in, registration, or welcome area for attendees', '📋', 'hospitality', ARRAY['trade_show_booth','live_brand_activation','film_premiere','game_release_activation'], 'inline', 100, '{"spatialStrategy":"required","humanConnection":"required","bigIdea":"inherit"}'),
  ('pickup_dropoff', 'Pick-Up / Drop-Off', 'Branded arrival/departure zone, sample collection, or package pickup area', '📦', 'support', ARRAY['trade_show_booth','live_brand_activation','film_premiere'], 'inline', 80, '{"spatialStrategy":"required","budgetLogic":"required","bigIdea":"inherit"}'),
  ('back_of_house', 'Back of House / Storage', 'Staff-only area for storage, equipment, catering prep, or operations', '🏗️', 'support', ARRAY['trade_show_booth','live_brand_activation','film_premiere','game_release_activation','permanent_installation'], 'custom', 200, '{"spatialStrategy":"required","budgetLogic":"required"}'),
  ('wayfinding_signage', 'Wayfinding / Signage System', 'Directional signage, digital wayfinding, or branded navigation system', '🪧', 'support', ARRAY['trade_show_booth','live_brand_activation','permanent_installation','architectural_brief'], 'custom', 0, '{"digitalStorytelling":"required","spatialStrategy":"required","bigIdea":"inherit"}'),
  ('outdoor_activation', 'Outdoor Activation', 'Open-air brand experience, street activation, or exterior event space', '🌳', 'outdoor', ARRAY['live_brand_activation','game_release_activation','film_premiere'], 'large_island', 2000, '{"bigIdea":"required","experienceFramework":"required","spatialStrategy":"required","budgetLogic":"required"}'),
  ('branded_vehicle', 'Branded Vehicle / Mobile', 'Custom truck, trailer, or mobile unit for touring activations', '🚐', 'outdoor', ARRAY['live_brand_activation','game_release_activation'], 'custom', 300, '{"bigIdea":"required","interactiveMechanics":"required","spatialStrategy":"required","budgetLogic":"required"}'),
  ('digital_experience', 'Digital / Hybrid Experience', 'Virtual, AR/VR, or hybrid digital activation component', '💻', 'digital', ARRAY['trade_show_booth','live_brand_activation','game_release_activation','permanent_installation'], 'custom', 0, '{"digitalStorytelling":"required","interactiveMechanics":"required","bigIdea":"inherit"}')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Phase 1C: Brand guidelines (structured, per client)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.brand_guidelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  color_system JSONB,
  typography JSONB,
  logo_rules JSONB,
  photography_style JSONB,
  tone_of_voice JSONB,
  materials_finishes JSONB,
  guidelines_version TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.brand_guidelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand guidelines"
  ON public.brand_guidelines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brand guidelines"
  ON public.brand_guidelines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own brand guidelines"
  ON public.brand_guidelines FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own brand guidelines"
  ON public.brand_guidelines FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all brand guidelines"
  ON public.brand_guidelines FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Phase 1D: Brand assets (files per client)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('logo','font','approved_image','brand_guide_pdf','icon_set','texture','pattern')),
  label TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  file_type TEXT,
  metadata JSONB,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own brand assets"
  ON public.brand_assets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own brand assets"
  ON public.brand_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own brand assets"
  ON public.brand_assets FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all brand assets"
  ON public.brand_assets FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Storage bucket for brand assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload brand assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'brand-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can read own brand assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'brand-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own brand assets" ON storage.objects
  FOR DELETE USING (bucket_id = 'brand-assets' AND auth.uid() IS NOT NULL);

-- =========================================================
-- Phase 1E: Venue intelligence
-- =========================================================

CREATE TABLE IF NOT EXISTS public.venue_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_name TEXT NOT NULL,
  venue TEXT,
  city TEXT,
  industry TEXT,
  design_tips TEXT[],
  traffic_patterns TEXT,
  audience_notes TEXT,
  logistics_notes TEXT,
  booth_placement_tips TEXT,
  typical_booth_sizes TEXT[],
  union_labor_required BOOLEAN,
  source TEXT DEFAULT 'manual',
  source_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.venue_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own venue intelligence"
  ON public.venue_intelligence FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own venue intelligence"
  ON public.venue_intelligence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own venue intelligence"
  ON public.venue_intelligence FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own venue intelligence"
  ON public.venue_intelligence FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all venue intelligence"
  ON public.venue_intelligence FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- Phase 1F: Extend brand_intelligence (no-op if created above)
-- =========================================================

ALTER TABLE public.brand_intelligence
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS relevance_weight NUMERIC DEFAULT 1.0;
-- NOTE: These columns already exist if brand_intelligence was created
-- in Phase 0C. The IF NOT EXISTS makes this idempotent.
