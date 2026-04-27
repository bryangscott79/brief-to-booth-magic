-- =========================================================================
-- INDUSTRIES ENGINE — multi-vertical foundation
--
-- Product thesis: Canopy serves any business where an environment needs to
-- be visualized, planned, and budgeted. Industries are a first-class
-- concept that parameterizes:
--   - Vocabulary (e.g. "Activation type" → "Project type" for architects)
--   - Project / activation type taxonomy
--   - Eventually, generation prompts and rendering style guides
--
-- v1 seeds four industries:
--   - experiential   (current home: trade shows, brand activations, events)
--   - architecture   (residential, commercial, hospitality, civic)
--   - landscape      (gardens, parks, plazas, restoration)
--   - entertainment  (film, TV, theater, themed, live)
-- =========================================================================

-- 1. industries lookup table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.industries (
  slug         text PRIMARY KEY,
  label        text NOT NULL,
  description  text,
  icon         text,
  -- vocabulary maps generic Canopy terms to industry-specific terms; the UI
  -- reads from this so headers/breadcrumbs/buttons say the right thing.
  vocabulary   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Display order for industry pickers
  sort_order   int NOT NULL DEFAULT 100,
  is_builtin   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.industries.vocabulary IS
  'JSONB map of generic terms → industry term. Keys: project_type, ' ||
  'project, deliverable, render, spatial_plan, brief, client.';

-- Anyone signed in can read the industries lookup
ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read industries"
  ON public.industries FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage industries"
  ON public.industries FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. Seed the four launch industries ----------------------------------------
INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order) VALUES
  (
    'experiential',
    'Experiential & Trade Show',
    'Brand activations, trade show booths, pop-ups, event marketing.',
    'Sparkles',
    jsonb_build_object(
      'project_type',  'Activation type',
      'project_types', 'Activation types',
      'project',       'Activation',
      'projects',      'Activations',
      'deliverable',   'Render package',
      'render',        'Booth render',
      'spatial_plan',  'Floor plan',
      'brief',         'Brief',
      'client',        'Client'
    ),
    10
  ),
  (
    'architecture',
    'Architecture & Construction',
    'Residential, commercial, hospitality, and civic buildings — new builds and renovations.',
    'Building2',
    jsonb_build_object(
      'project_type',  'Project type',
      'project_types', 'Project types',
      'project',       'Project',
      'projects',      'Projects',
      'deliverable',   'Drawing set',
      'render',        'Architectural rendering',
      'spatial_plan',  'Floor plan',
      'brief',         'Project brief',
      'client',        'Client'
    ),
    20
  ),
  (
    'landscape',
    'Landscape & Site Design',
    'Gardens, parks, plazas, streetscapes, restoration, and site planning.',
    'TreePine',
    jsonb_build_object(
      'project_type',  'Project type',
      'project_types', 'Project types',
      'project',       'Site',
      'projects',      'Sites',
      'deliverable',   'Site plan package',
      'render',        'Site rendering',
      'spatial_plan',  'Site plan',
      'brief',         'Site brief',
      'client',        'Client'
    ),
    30
  ),
  (
    'entertainment',
    'Entertainment & Production',
    'Film, TV, theatrical, themed entertainment, concerts, and live events.',
    'Film',
    jsonb_build_object(
      'project_type',  'Production type',
      'project_types', 'Production types',
      'project',       'Production',
      'projects',      'Productions',
      'deliverable',   'Set design package',
      'render',        'Set rendering',
      'spatial_plan',  'Stage plan',
      'brief',         'Production brief',
      'client',        'Production company'
    ),
    40
  )
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  vocabulary = EXCLUDED.vocabulary,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 3. agencies: industry fields ----------------------------------------------
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS primary_industry text REFERENCES public.industries(slug) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS industries text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS agencies_primary_industry_idx ON public.agencies(primary_industry);
CREATE INDEX IF NOT EXISTS agencies_industries_idx ON public.agencies USING gin(industries);

COMMENT ON COLUMN public.agencies.primary_industry IS
  'Drives platform vocabulary. Should be one of the slugs in industries.industries.';
COMMENT ON COLUMN public.agencies.industries IS
  'All industries this agency works across. Filters which activation types ' ||
  'they see and which playbooks apply.';

-- Best-effort backfill: existing agencies default to experiential
UPDATE public.agencies
SET primary_industry = 'experiential',
    industries = ARRAY['experiential']
WHERE primary_industry IS NULL;

-- 4. activation_types: industry tagging -------------------------------------
ALTER TABLE public.activation_types
  ADD COLUMN IF NOT EXISTS industries text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS activation_types_industries_idx ON public.activation_types USING gin(industries);

COMMENT ON COLUMN public.activation_types.industries IS
  'Industries this activation/project type belongs to. A type can serve ' ||
  'multiple industries (e.g. "Pop-up retail" → experiential + retail).';

-- Tag the existing 15 built-in types as experiential
UPDATE public.activation_types
SET industries = ARRAY['experiential']
WHERE is_builtin = true AND (industries IS NULL OR cardinality(industries) = 0);

-- 5. Seed project types per industry ----------------------------------------
-- Each row uses ON CONFLICT (slug) DO NOTHING so this is idempotent.
INSERT INTO public.activation_types (slug, label, description, category, industries, is_builtin) VALUES
  -- ─── Architecture & Construction ───────────────────────────────────────
  ('arch_single_family',          'Single-family home',         'New custom home or spec home for a single family.',                'residential',  ARRAY['architecture'], true),
  ('arch_multi_family',           'Multi-family residential',   'Apartments, condos, townhomes — small to mid-rise.',                'residential',  ARRAY['architecture'], true),
  ('arch_residential_renovation', 'Residential renovation',     'Whole-home or major rooms — kitchens, bathrooms, basements.',       'residential',  ARRAY['architecture'], true),
  ('arch_residential_addition',   'Residential addition',       'Additions, second-stories, accessory dwelling units (ADUs).',       'residential',  ARRAY['architecture'], true),
  ('arch_office_buildout',        'Office buildout',            'Commercial office tenant improvement or new lease space.',          'commercial',   ARRAY['architecture'], true),
  ('arch_retail_store',           'Retail store',               'Storefront design, flagship, branded retail.',                      'commercial',   ARRAY['architecture'], true),
  ('arch_restaurant',             'Restaurant',                 'Restaurant interior + exterior, ranging from QSR to fine dining.',  'hospitality',  ARRAY['architecture'], true),
  ('arch_hotel',                  'Hotel / hospitality',        'Hotels, resorts, inns, boutique lodging.',                          'hospitality',  ARRAY['architecture'], true),
  ('arch_mixed_use',              'Mixed-use development',      'Combined residential + commercial + civic in one development.',     'commercial',   ARRAY['architecture'], true),
  ('arch_civic',                  'Civic / public building',    'Schools, libraries, government buildings, transit, museums.',       'civic',        ARRAY['architecture'], true),
  ('arch_healthcare',             'Healthcare facility',        'Clinics, hospital wings, dental, vet, urgent care.',                'civic',        ARRAY['architecture'], true),
  ('arch_industrial',             'Industrial / warehouse',     'Logistics, manufacturing, distribution, data centers.',             'commercial',   ARRAY['architecture'], true),

  -- ─── Landscape & Site Design ───────────────────────────────────────────
  ('land_residential_garden',     'Residential garden',         'Front/backyard, courtyards, edible gardens.',                       'residential',  ARRAY['landscape'], true),
  ('land_residential_estate',     'Residential estate',         'Large-property estate landscaping with multiple zones.',            'residential',  ARRAY['landscape'], true),
  ('land_public_park',            'Public park',                'Neighborhood parks, dog parks, plazas, pocket parks.',              'civic',        ARRAY['landscape'], true),
  ('land_streetscape',            'Urban streetscape',          'Streetscapes, complete streets, road diets, public realm.',         'civic',        ARRAY['landscape'], true),
  ('land_commercial_plaza',       'Commercial plaza',           'Office campus plazas, retail center landscapes.',                   'commercial',   ARRAY['landscape'], true),
  ('land_rooftop',                'Rooftop / green roof',       'Green roofs, rooftop gardens, rooftop bars and amenities.',         'commercial',   ARRAY['landscape'], true),
  ('land_sports_rec',             'Sports & recreation',        'Sports fields, golf, tennis, parks-and-recreation amenities.',      'civic',        ARRAY['landscape'], true),
  ('land_restoration',            'Ecological restoration',     'Wetland, prairie, riparian restoration projects.',                  'civic',        ARRAY['landscape'], true),

  -- ─── Entertainment & Production ────────────────────────────────────────
  ('ent_feature_film',            'Feature film set',           'Theatrical feature film production design.',                        'film',         ARRAY['entertainment'], true),
  ('ent_episodic',                'Episodic series set',        'Multi-episode TV / streaming series sets.',                         'film',         ARRAY['entertainment'], true),
  ('ent_commercial',              'Commercial / spot set',      '15s–60s commercial production for brands and advertisers.',         'film',         ARRAY['entertainment'], true),
  ('ent_music_video',             'Music video set',            'Music video production design — performance and narrative.',        'film',         ARRAY['entertainment'], true),
  ('ent_theatrical',              'Theatrical set',             'Stage set design for theater, opera, dance, musical.',              'live',         ARRAY['entertainment'], true),
  ('ent_immersive_theater',       'Immersive / experiential theater', 'Walk-through, durational, site-specific live experiences.', 'live',         ARRAY['entertainment'], true),
  ('ent_concert_tour',            'Concert tour stage',         'Headline tour main stage + production design package.',             'live',         ARRAY['entertainment'], true),
  ('ent_festival_stage',          'Festival stage',             'Festival main stage / second stage / dance tent.',                  'live',         ARRAY['entertainment'], true),
  ('ent_themed_attraction',       'Themed attraction',          'Theme park rides, dark rides, themed restaurant, escape rooms.',    'themed',       ARRAY['entertainment'], true),
  ('ent_esports',                 'Esports / gaming venue',     'Esports arenas, gaming venues, branded gaming activations.',        'live',         ARRAY['entertainment'], true)
ON CONFLICT (slug) DO UPDATE SET
  industries = EXCLUDED.industries,
  category = EXCLUDED.category,
  description = COALESCE(public.activation_types.description, EXCLUDED.description),
  is_builtin = EXCLUDED.is_builtin;

-- 6. Update create_my_agency to accept industry params ----------------------
-- Replaces the version from the previous migration with industry-aware logic.
CREATE OR REPLACE FUNCTION public.create_my_agency(
  _name text,
  _logo_url text DEFAULT NULL,
  _brand_colors jsonb DEFAULT NULL,
  _primary_industry text DEFAULT 'experiential',
  _industries text[] DEFAULT ARRAY['experiential']
)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  trimmed_name text;
  generated_slug text;
  new_row public.agencies%ROWTYPE;
  attempt int := 0;
  resolved_primary text;
  resolved_industries text[];
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = caller) THEN
    RAISE EXCEPTION 'You already belong to an agency' USING ERRCODE = '23505';
  END IF;

  trimmed_name := trim(coalesce(_name, ''));
  IF length(trimmed_name) < 2 THEN
    RAISE EXCEPTION 'Agency name must be at least 2 characters' USING ERRCODE = '22023';
  END IF;
  IF length(trimmed_name) > 80 THEN
    RAISE EXCEPTION 'Agency name must be 80 characters or fewer' USING ERRCODE = '22023';
  END IF;

  -- Validate industries: every slug must exist in industries table
  resolved_primary := coalesce(_primary_industry, 'experiential');
  IF NOT EXISTS (SELECT 1 FROM public.industries WHERE slug = resolved_primary) THEN
    RAISE EXCEPTION 'Unknown industry: %', resolved_primary USING ERRCODE = '22023';
  END IF;

  resolved_industries := coalesce(_industries, ARRAY[resolved_primary]);
  -- Ensure the primary is in the array
  IF NOT (resolved_primary = ANY(resolved_industries)) THEN
    resolved_industries := array_append(resolved_industries, resolved_primary);
  END IF;
  -- Drop any unknown slugs
  resolved_industries := ARRAY(
    SELECT s FROM unnest(resolved_industries) s
    WHERE EXISTS (SELECT 1 FROM public.industries WHERE slug = s)
  );

  -- Slug generation (same as before)
  LOOP
    attempt := attempt + 1;
    generated_slug :=
      lower(regexp_replace(trimmed_name, '[^a-zA-Z0-9]+', '-', 'g'))
      || '-'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    generated_slug := regexp_replace(generated_slug, '^-+|-+$', '', 'g');
    generated_slug := substr(generated_slug, 1, 60);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agencies WHERE slug = generated_slug);
    IF attempt > 5 THEN
      RAISE EXCEPTION 'Could not generate a unique slug after 5 attempts';
    END IF;
  END LOOP;

  -- Insert; handle owner column-name variance across schemas
  BEGIN
    INSERT INTO public.agencies (name, slug, owner_user_id, logo_url, brand_colors, primary_industry, industries)
    VALUES (trimmed_name, generated_slug, caller, _logo_url, _brand_colors, resolved_primary, resolved_industries)
    RETURNING * INTO new_row;
  EXCEPTION WHEN undefined_column THEN
    EXECUTE
      'INSERT INTO public.agencies (name, slug, primary_owner_id, logo_url, brand_colors, primary_industry, industries)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *'
    INTO new_row
    USING trimmed_name, generated_slug, caller, _logo_url, _brand_colors, resolved_primary, resolved_industries;
  END;

  INSERT INTO public.agency_members (agency_id, user_id, role, invited_by)
  VALUES (new_row.id, caller, 'owner', caller)
  ON CONFLICT (agency_id, user_id) DO NOTHING;

  -- Backfill orphaned data
  BEGIN
    UPDATE public.clients SET agency_id = new_row.id
    WHERE user_id = caller AND agency_id IS NULL;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  BEGIN
    UPDATE public.projects SET agency_id = new_row.id
    WHERE user_id = caller AND agency_id IS NULL;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  BEGIN
    UPDATE public.knowledge_documents SET agency_id = new_row.id
    WHERE uploaded_by = caller AND agency_id IS NULL;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_my_agency(text, text, jsonb, text, text[]) TO authenticated;

-- Drop the older 3-arg signature so callers must use the new one.
DROP FUNCTION IF EXISTS public.create_my_agency(text, text, jsonb);

-- 7. Update agency-industries RPC ------------------------------------------
-- For agencies that already exist and want to update their industry list.
CREATE OR REPLACE FUNCTION public.update_my_agency_industries(
  _primary_industry text,
  _industries text[]
)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  target_agency uuid;
  resolved_primary text;
  resolved_industries text[];
  updated_row public.agencies%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Caller must be owner or admin of the agency they're updating
  SELECT am.agency_id INTO target_agency
  FROM public.agency_members am
  WHERE am.user_id = caller AND am.role IN ('owner', 'admin')
  LIMIT 1;

  IF target_agency IS NULL THEN
    RAISE EXCEPTION 'You must be an owner or admin to update agency industries'
      USING ERRCODE = '42501';
  END IF;

  resolved_primary := coalesce(_primary_industry, 'experiential');
  IF NOT EXISTS (SELECT 1 FROM public.industries WHERE slug = resolved_primary) THEN
    RAISE EXCEPTION 'Unknown industry: %', resolved_primary USING ERRCODE = '22023';
  END IF;

  resolved_industries := coalesce(_industries, ARRAY[resolved_primary]);
  IF NOT (resolved_primary = ANY(resolved_industries)) THEN
    resolved_industries := array_append(resolved_industries, resolved_primary);
  END IF;
  resolved_industries := ARRAY(
    SELECT s FROM unnest(resolved_industries) s
    WHERE EXISTS (SELECT 1 FROM public.industries WHERE slug = s)
  );

  UPDATE public.agencies
  SET primary_industry = resolved_primary,
      industries       = resolved_industries,
      updated_at       = now()
  WHERE id = target_agency
  RETURNING * INTO updated_row;

  RETURN updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_agency_industries(text, text[]) TO authenticated;
