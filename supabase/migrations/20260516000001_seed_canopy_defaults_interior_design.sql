-- =========================================================================
-- ADD: seed_canopy_defaults() must include interior_design
--
-- Why this migration exists:
-- The original reseed RPC (migration 20260428000000) hardcoded the 5
-- launch industries: experiential, architecture, landscape,
-- entertainment, audio_visual. Industries v2 added a sixth —
-- interior_design — with inputMode "existing-space-photo" (the
-- redesign-from-photo path).
--
-- The reseed RPC is wired to the super-admin "Re-seed defaults"
-- button. Without this update, calling that button on a fresh DB —
-- or any DB where the interior_design industry row hasn't been
-- inserted directly — leaves the industries table missing the row
-- the new ID code path depends on. Fresh installs that lean on the
-- RPC for bootstrap therefore land in a degraded state.
--
-- Fix: CREATE OR REPLACE the function with the same body as before,
-- with the interior_design row appended to the INSERT list. The
-- function stays SECURITY DEFINER + super-admin-gated and the
-- ON CONFLICT DO NOTHING guarantee makes the call idempotent.
-- =========================================================================

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

  -- Re-run the inserts (same idempotent pattern as the base migration).
  -- Keeping the body in lockstep with the 20260428 migration so the
  -- two paths (migration auto-run vs. admin-button fallback) seed
  -- equivalent state.
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
    ('interior_design', 'Interior Design',
     'Residential, hospitality, restaurant, retail — redesigns of existing spaces.',
     'Sofa',
     jsonb_build_object('project_type','Project type','project_types','Project types','project','Project','projects','Projects','deliverable','Concept package','render','Concept render','spatial_plan','Floor plan','brief','Design brief','client','Client'),
     35, true),
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
  -- function payload small. The migration body in 20260428000000 handles
  -- them. If a super admin needs to re-seed types, run the migration again.

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
  'Super-admin-only fallback to ensure the 6 launch industries exist ' ||
  '(experiential, architecture, landscape, interior_design, entertainment, audio_visual). ' ||
  'Returns counts before/after. Safe to call repeatedly.';
