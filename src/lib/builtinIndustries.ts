// Canonical Canopy industries.
//
// These five verticals are foundational — they ship with every deployment.
// They live here as a TypeScript constant so the platform never depends on
// migration timing for the basics. The Admin Industries page upserts them
// into the database on first super-admin visit; from then on they're
// editable like any other row.
//
// Adding a new built-in industry: append to this list AND update
// migration 20260428000000_reseed_industries_and_project_types.sql so
// fresh deployments still get them via the migration path.

export interface BuiltinIndustry {
  slug: string;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  vocabulary: Record<string, string>;
  sort_order: number;
}

export const BUILTIN_INDUSTRIES: BuiltinIndustry[] = [
  {
    slug: "experiential",
    label: "Experiential & Trade Show",
    description: "Brand activations, trade show booths, pop-ups, event marketing.",
    icon: "Sparkles",
    vocabulary: {
      project_type: "Activation type",
      project_types: "Activation types",
      project: "Activation",
      projects: "Activations",
      deliverable: "Render package",
      render: "Booth render",
      spatial_plan: "Floor plan",
      brief: "Brief",
      client: "Client",
    },
    sort_order: 10,
  },
  {
    slug: "architecture",
    label: "Architecture & Construction",
    description:
      "Residential, commercial, hospitality, and civic buildings — new builds and renovations.",
    icon: "Building2",
    vocabulary: {
      project_type: "Project type",
      project_types: "Project types",
      project: "Project",
      projects: "Projects",
      deliverable: "Drawing set",
      render: "Architectural rendering",
      spatial_plan: "Floor plan",
      brief: "Project brief",
      client: "Client",
    },
    sort_order: 20,
  },
  {
    slug: "landscape",
    label: "Landscape & Site Design",
    description: "Gardens, parks, plazas, streetscapes, restoration, and site planning.",
    icon: "TreePine",
    vocabulary: {
      project_type: "Project type",
      project_types: "Project types",
      project: "Site",
      projects: "Sites",
      deliverable: "Site plan package",
      render: "Site rendering",
      spatial_plan: "Site plan",
      brief: "Site brief",
      client: "Client",
    },
    sort_order: 30,
  },
  {
    slug: "entertainment",
    label: "Entertainment & Production",
    description: "Film, TV, theatrical, themed entertainment, concerts, and live events.",
    icon: "Film",
    vocabulary: {
      project_type: "Production type",
      project_types: "Production types",
      project: "Production",
      projects: "Productions",
      deliverable: "Set design package",
      render: "Set rendering",
      spatial_plan: "Stage plan",
      brief: "Production brief",
      client: "Production company",
    },
    sort_order: 40,
  },
  {
    slug: "audio_visual",
    label: "A/V Integration & Install",
    description:
      "Audio-visual systems for corporate, hospitality, education, worship, residential.",
    icon: "Speaker",
    vocabulary: {
      project_type: "System type",
      project_types: "System types",
      project: "Install",
      projects: "Installs",
      deliverable: "Equipment list & layout",
      render: "System rendering",
      spatial_plan: "Equipment layout",
      brief: "Scope of work",
      client: "Client",
    },
    sort_order: 50,
  },
];
