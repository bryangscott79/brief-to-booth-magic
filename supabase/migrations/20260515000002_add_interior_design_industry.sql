-- Add interior_design as the 6th built-in industry.
--
-- BuiltinIndustry constant in src/lib/builtinIndustries.ts is the
-- source of truth for the new TS-level fields (briefSections,
-- inputMode, defaultRenderAngles), but the DB row still needs to
-- exist for the AdminIndustries UI to surface it and for any
-- per-row admin overrides to anchor on a real id.
--
-- ON CONFLICT DO NOTHING so fresh deployments + existing deployments
-- both arrive at the same final state without clobbering admin edits.

INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order, is_builtin)
VALUES (
  'interior_design',
  'Interior Design',
  'Residential, hospitality, restaurant, retail — redesigns of existing spaces.',
  'Sofa',
  '{
    "project_type": "Project type",
    "project_types": "Project types",
    "project": "Project",
    "projects": "Projects",
    "deliverable": "Concept package",
    "render": "Concept render",
    "spatial_plan": "Floor plan",
    "brief": "Design brief",
    "client": "Client"
  }'::jsonb,
  35,
  true
)
ON CONFLICT (slug) DO NOTHING;
