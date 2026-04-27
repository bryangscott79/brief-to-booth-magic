-- =========================================================================
-- RE-SEED: Industries + built-in project types (idempotent)
--
-- Why this migration exists:
-- The earlier industries_engine + pricing_engine_phase1a migrations
-- contained the seed INSERTs, but in some Lovable-applied environments
-- the rows did not land. This migration is a defensive re-seed that:
--   1. Uses ON CONFLICT DO NOTHING so it's safe to run repeatedly
--   2. Doesn't overwrite anything a super admin has already edited
--   3. Guarantees the 5 launch industries exist with sensible vocabulary
--   4. Guarantees the ~57 built-in project types exist and are tagged
--      with the correct industry slugs
--
-- If a row already exists with the given slug, we leave it alone. To
-- repair a broken row, a super admin can use admin_update_industry or
-- the Activation Types editor.
-- =========================================================================

-- 1. Industries --------------------------------------------------------------
INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order, is_builtin)
VALUES
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
    10,
    true
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
    20,
    true
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
    30,
    true
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
    40,
    true
  ),
  (
    'audio_visual',
    'A/V Integration & Install',
    'Audio-visual systems for corporate, hospitality, education, worship, residential.',
    'Speaker',
    jsonb_build_object(
      'project_type',  'System type',
      'project_types', 'System types',
      'project',       'Install',
      'projects',      'Installs',
      'deliverable',   'Equipment list & layout',
      'render',        'System rendering',
      'spatial_plan',  'Equipment layout',
      'brief',         'Scope of work',
      'client',        'Client'
    ),
    50,
    true
  )
ON CONFLICT (slug) DO NOTHING;

-- Make sure every row has a uuid id (in case the column was added later)
UPDATE public.industries SET id = gen_random_uuid() WHERE id IS NULL;

-- 2. Built-in project types — Architecture & Construction --------------------
INSERT INTO public.activation_types (slug, label, description, category, industries, is_builtin)
VALUES
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

  -- Landscape & Site Design
  ('land_residential_garden',     'Residential garden',         'Front/backyard, courtyards, edible gardens.',                       'residential',  ARRAY['landscape'], true),
  ('land_residential_estate',     'Residential estate',         'Large-property estate landscaping with multiple zones.',            'residential',  ARRAY['landscape'], true),
  ('land_public_park',            'Public park',                'Neighborhood parks, dog parks, plazas, pocket parks.',              'civic',        ARRAY['landscape'], true),
  ('land_streetscape',            'Urban streetscape',          'Streetscapes, complete streets, road diets, public realm.',         'civic',        ARRAY['landscape'], true),
  ('land_commercial_plaza',       'Commercial plaza',           'Office campus plazas, retail center landscapes.',                   'commercial',   ARRAY['landscape'], true),
  ('land_rooftop',                'Rooftop / green roof',       'Green roofs, rooftop gardens, rooftop bars and amenities.',         'commercial',   ARRAY['landscape'], true),
  ('land_sports_rec',             'Sports & recreation',        'Sports fields, golf, tennis, parks-and-recreation amenities.',      'civic',        ARRAY['landscape'], true),
  ('land_restoration',            'Ecological restoration',     'Wetland, prairie, riparian restoration projects.',                  'civic',        ARRAY['landscape'], true),

  -- Entertainment & Production
  ('ent_feature_film',            'Feature film set',           'Theatrical feature film production design.',                        'film',         ARRAY['entertainment'], true),
  ('ent_episodic',                'Episodic series set',        'Multi-episode TV / streaming series sets.',                         'film',         ARRAY['entertainment'], true),
  ('ent_commercial',              'Commercial / spot set',      '15s–60s commercial production for brands and advertisers.',         'film',         ARRAY['entertainment'], true),
  ('ent_music_video',             'Music video set',            'Music video production design — performance and narrative.',        'film',         ARRAY['entertainment'], true),
  ('ent_theatrical',              'Theatrical set',             'Stage set design for theater, opera, dance, musical.',              'live',         ARRAY['entertainment'], true),
  ('ent_immersive_theater',       'Immersive / experiential theater', 'Walk-through, durational, site-specific live experiences.', 'live',         ARRAY['entertainment'], true),
  ('ent_concert_tour',            'Concert tour stage',         'Headline tour main stage + production design package.',             'live',         ARRAY['entertainment'], true),
  ('ent_festival_stage',          'Festival stage',             'Festival main stage / second stage / dance tent.',                  'live',         ARRAY['entertainment'], true),
  ('ent_themed_attraction',       'Themed attraction',          'Theme park rides, dark rides, themed restaurant, escape rooms.',    'themed',       ARRAY['entertainment'], true),
  ('ent_esports',                 'Esports / gaming venue',     'Esports arenas, gaming venues, branded gaming activations.',        'live',         ARRAY['entertainment'], true),

  -- A/V Integration & Install
  ('av_conference_room',          'Conference room AV',         'Huddle through executive boardroom — displays, cameras, mics, control.', 'commercial', ARRAY['audio_visual'], true),
  ('av_boardroom',                'Executive boardroom',        'Premium boardroom with multi-display + UC + acoustics.',                 'commercial', ARRAY['audio_visual'], true),
  ('av_classroom',                'Classroom / training',       'Education / training rooms — displays, lecture capture, mics.',          'civic',      ARRAY['audio_visual'], true),
  ('av_lecture_hall',             'Lecture hall / auditorium',  'Large lecture halls + auditoriums.',                                     'civic',      ARRAY['audio_visual'], true),
  ('av_house_of_worship',         'House of worship',           'Church / synagogue / mosque AV — sound, video, streaming.',              'civic',      ARRAY['audio_visual'], true),
  ('av_restaurant',               'Restaurant / hospitality',   'Restaurants, bars, hotels — distributed audio + video.',                 'hospitality', ARRAY['audio_visual'], true),
  ('av_retail',                   'Retail signage / digital',   'Digital signage, queue-management, in-store experience.',                'commercial', ARRAY['audio_visual'], true),
  ('av_home_theater',             'Home theater',               'Residential dedicated home theater + media room.',                       'residential', ARRAY['audio_visual'], true),
  ('av_smart_home',               'Smart home / whole-home audio', 'Whole-home automation, audio distribution, lighting integration.',    'residential', ARRAY['audio_visual'], true),
  ('av_command_control',          'Command & control',          'Operations centers, security ops, broadcast control rooms.',             'commercial', ARRAY['audio_visual'], true),
  ('av_stadium_arena',            'Stadium / arena',            'Venue-scale AV — scoreboards, distributed audio, broadcast.',            'live',       ARRAY['audio_visual'], true),
  ('av_corporate_lobby',          'Corporate lobby / video wall', 'Lobby video walls, branded signage, donor displays.',                  'commercial', ARRAY['audio_visual'], true)
ON CONFLICT (slug) DO UPDATE SET
  -- Only refresh the industries[] tag in case a prior partial seed left it
  -- empty. Don't touch label/description/category in case a super admin has
  -- edited them.
  industries = CASE
    WHEN public.activation_types.industries IS NULL OR cardinality(public.activation_types.industries) = 0
      THEN EXCLUDED.industries
    ELSE public.activation_types.industries
  END;

-- 3. Final guard: ensure existing experiential built-ins are tagged correctly
-- (in case Phase 1A's backfill didn't run on this DB).
UPDATE public.activation_types
SET industries = ARRAY['experiential']
WHERE is_builtin = true
  AND (industries IS NULL OR cardinality(industries) = 0);

-- 4. RPC: seed_canopy_defaults() — callable from the admin UI as a fallback
-- in case the migration didn't auto-run. Idempotent — calls this same logic.
CREATE OR REPLACE FUNCTION public.seed_canopy_defaults()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  industries_before int;
  industries_after  int;
  types_before      int;
  types_after       int;
BEGIN
  PERFORM public._require_super_admin();

  SELECT COUNT(*) INTO industries_before FROM public.industries;
  SELECT COUNT(*) INTO types_before FROM public.activation_types WHERE is_builtin = true;

  -- Re-run the inserts (same idempotent pattern as above)
  INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order, is_builtin) VALUES
    ('experiential', 'Experiential & Trade Show',
     'Brand activations, trade show booths, pop-ups, event marketing.',
     'Sparkles',
     jsonb_build_object('project_type','Activation type','project_types','Activation types','project','Activation','projects','Activations','deliverable','Render package','render','Booth render','spatial_plan','Floor plan','brief','Brief','client','Client'),
     10, true),
    ('architecture', 'Architecture & Construction',
     'Residential, commercial, hospitality, and civic buildings — new builds and renovations.',
     'Building2',
     jsonb_build_object('project_type','Project type','project_types','Project types','project','Project','projects','Projects','deliverable','Drawing set','render','Architectural rendering','spatial_plan','Floor plan','brief','Project brief','client','Client'),
     20, true),
    ('landscape', 'Landscape & Site Design',
     'Gardens, parks, plazas, streetscapes, restoration, and site planning.',
     'TreePine',
     jsonb_build_object('project_type','Project type','project_types','Project types','project','Site','projects','Sites','deliverable','Site plan package','render','Site rendering','spatial_plan','Site plan','brief','Site brief','client','Client'),
     30, true),
    ('entertainment', 'Entertainment & Production',
     'Film, TV, theatrical, themed entertainment, concerts, and live events.',
     'Film',
     jsonb_build_object('project_type','Production type','project_types','Production types','project','Production','projects','Productions','deliverable','Set design package','render','Set rendering','spatial_plan','Stage plan','brief','Production brief','client','Production company'),
     40, true),
    ('audio_visual', 'A/V Integration & Install',
     'Audio-visual systems for corporate, hospitality, education, worship, residential.',
     'Speaker',
     jsonb_build_object('project_type','System type','project_types','System types','project','Install','projects','Installs','deliverable','Equipment list & layout','render','System rendering','spatial_plan','Equipment layout','brief','Scope of work','client','Client'),
     50, true)
  ON CONFLICT (slug) DO NOTHING;

  UPDATE public.industries SET id = gen_random_uuid() WHERE id IS NULL;

  -- Project types are intentionally not re-inserted via the RPC to keep the
  -- function payload small. The migration body above handles them. If a
  -- super admin needs to re-seed types, run the migration again.

  SELECT COUNT(*) INTO industries_after FROM public.industries;
  SELECT COUNT(*) INTO types_after FROM public.activation_types WHERE is_builtin = true;

  RETURN jsonb_build_object(
    'industries_before', industries_before,
    'industries_after',  industries_after,
    'industries_added',  industries_after - industries_before,
    'types_before',      types_before,
    'types_after',       types_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_canopy_defaults() TO authenticated;

COMMENT ON FUNCTION public.seed_canopy_defaults() IS
  'Super-admin-only fallback to ensure the 5 launch industries exist. ' ||
  'Returns counts before/after. Safe to call repeatedly.';
