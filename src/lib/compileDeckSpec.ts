// compileDeckSpec — deterministic ParsedBrief/elements/renders → DeckSpec.
//
// This is the content half of the deck system: it pulls REAL project data
// into the typed slide model (deckSpec.ts) and never invents copy. Any
// slide whose source data is absent is skipped outright — the compiled
// deck only contains what the project actually knows.
//
// Slide order (families skipped when empty):
//   cover
//   section 01 "The Ask"        → briefSummary
//   section 02 "The Concept"    → concept, elementGrid
//   section 03 "The Space"      → spatial, renderFull (hero), video?,
//                                  then the other renders per
//                                  renderPresentation (see below)
//   section 04 "The Investment" → budget, materials?, nextSteps
//   closing
//
// Render presentation (owner feedback: "more full-slide images of the booth
// vs 4-up"):
//   full  (default) — hero + EVERY selected render as its own full-bleed
//                     slide, captioned with its angle label.
//   mixed           — hero full, featured renders full, the rest in 2-up
//                     grids (a single leftover gets its own slide).
//   grid            — the original behaviour: hero full, the rest 4-up
//                     (2–3 leftovers → one grid, one leftover → full).
// `featuredRenderIds` force a full-bleed slide in mixed / grid modes;
// `selectedRenderIds` restrict which current renders are used at all.

import type { BrandKit } from "./brandKit";
import type {
  DeckSpec,
  SlideSpec,
  ImageSlot,
  FactRow,
  RenderGridSlide,
  VideoSlide,
} from "./deckSpec";

// ── Inputs ────────────────────────────────────────────────────────────────────

/** The slice of a project image row the compiler needs. */
export interface DeckRenderImage {
  angle_id: string;
  angle_name: string;
  public_url: string;
  is_current: boolean;
}

export type RenderPresentation = "full" | "mixed" | "grid";

export const DEFAULT_RENDER_PRESENTATION: RenderPresentation = "full";

export const RENDER_PRESENTATIONS: ReadonlyArray<{ id: RenderPresentation; label: string; blurb: string }> = [
  { id: "full", label: "One per slide", blurb: "Every render full-bleed — the booth at its biggest." },
  { id: "mixed", label: "Mixed", blurb: "Hero and featured renders full-bleed, the rest paired 2-up." },
  { id: "grid", label: "Compact grids", blurb: "Hero full-bleed, the rest in 4-up grids." },
] as const;

export const isRenderPresentation = (v: unknown): v is RenderPresentation =>
  v === "full" || v === "mixed" || v === "grid";

/** A persisted walkthrough clip (see deckVideo.ts / DeckVideoContent). */
export interface DeckVideoInput {
  url: string;
  posterUrl?: string | null;
  label?: string | null;
  durationSec?: number | null;
}

/** Optional materials estimate (from the generate-materials edge fn —
 *  it lives in component state, not in elements, so callers pass it in). */
export interface DeckMaterialsInput {
  categories: Array<{
    name: string;
    items: Array<{ name: string }>;
    subtotal: number;
  }>;
  grandTotal: number;
  notes?: string;
}

export interface CompileDeckInputs {
  project: { name?: string | null } | null;
  /** ParsedBrief — typed loosely because legacy rows drift from the schema. */
  parsedBrief: Record<string, any> | null;
  /** Record<ElementType, ElementState> — same loose treatment. */
  elements: Record<string, { status?: string; data?: any }> | null;
  renders: DeckRenderImage[];
  kit: BrandKit;
  boothSizeLabel?: string;
  materials?: DeckMaterialsInput | null;
  /** How the view renders are laid out. Omit → "full". */
  renderPresentation?: RenderPresentation | null;
  /** angle_ids to include. Omit / null → every current render. */
  selectedRenderIds?: string[] | null;
  /** angle_ids that get their own full-bleed slide even in mixed / grid. */
  featuredRenderIds?: string[] | null;
  /** Embedded walkthrough clip → one `video` slide after the hero render. */
  video?: DeckVideoInput | null;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const clamp = (text: unknown, max: number): string => {
  const s = typeof text === "string" ? text.trim() : "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + "…";
};

const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;

const money = (n: number): string =>
  "$" + Math.round(n).toLocaleString("en-US");

/** Element data only counts when the element completed and has content. */
const elementData = (
  elements: CompileDeckInputs["elements"],
  key: string,
): any | null => {
  const el = elements?.[key];
  if (!el || !el.data) return null;
  if (el.status && el.status !== "complete") return null;
  return el.data;
};

// ── Element distillation ──────────────────────────────────────────────────────
//
// One or two lines per strategy element for the elementGrid — extracted per
// element type from the fields each generator actually writes (same paths
// ElementDashboard.getPreviewText reads, extended for a fuller sentence).

interface ElementCard {
  title: string;
  body: string;
}

function distillElement(key: string, data: any): ElementCard | null {
  switch (key) {
    case "bigIdea": {
      const body = [data.subheadline, data.strategicPosition, data.narrative].find(nonEmpty);
      if (!nonEmpty(data.headline) && !body) return null;
      return {
        title: nonEmpty(data.headline) ? data.headline : "Big Idea",
        body: clamp(body ?? "", 150),
      };
    }
    case "experienceFramework": {
      if (!nonEmpty(data.conceptDescription)) return null;
      const stages = Array.isArray(data.visitorJourney) ? data.visitorJourney.length : 0;
      const suffix = stages > 1 ? ` A ${stages}-stage visitor journey.` : "";
      return {
        title: "Experience Framework",
        body: clamp(data.conceptDescription, 150 - suffix.length) + suffix,
      };
    }
    case "interactiveMechanics": {
      const hero = data.hero;
      if (!hero || !nonEmpty(hero.name)) return null;
      return {
        title: hero.name,
        body: clamp(
          [hero.concept, hero.physicalForm?.structure].find(nonEmpty) ?? "Hero interactive installation.",
          150,
        ),
      };
    }
    case "digitalStorytelling": {
      if (!nonEmpty(data.philosophy)) return null;
      const tracks = Array.isArray(data.audienceTracks) ? data.audienceTracks.length : 0;
      const suffix = tracks > 1 ? ` ${tracks} audience content tracks.` : "";
      return {
        title: "Digital Storytelling",
        body: clamp(data.philosophy, 150 - suffix.length) + suffix,
      };
    }
    case "humanConnection": {
      const zones: string[] = (data.configs?.[0]?.zones ?? [])
        .map((z: any) => z?.name)
        .filter(nonEmpty);
      const body = zones.length
        ? `${zones.slice(0, 3).join(" · ")}${nonEmpty(data.scalingNotes) ? ". " + data.scalingNotes : ""}`
        : data.scalingNotes;
      if (!nonEmpty(body)) return null;
      return { title: "Human Connection", body: clamp(body, 150) };
    }
    case "adjacentActivations": {
      const names: string[] = (data.activations ?? [])
        .map((a: any) => a?.name)
        .filter(nonEmpty);
      const body = names.length
        ? `${names.slice(0, 2).join(" + ")}${nonEmpty(data.competitivePositioning) ? ". " + data.competitivePositioning : ""}`
        : data.competitivePositioning;
      if (!nonEmpty(body)) return null;
      return { title: "Beyond the Booth", body: clamp(body, 150) };
    }
    default:
      return null;
  }
}

/** Elements that get grid cards — spatialStrategy & budgetLogic own full slides. */
const GRID_ELEMENT_KEYS = [
  "bigIdea",
  "experienceFramework",
  "interactiveMechanics",
  "digitalStorytelling",
  "humanConnection",
  "adjacentActivations",
] as const;

// ── Render grouping ───────────────────────────────────────────────────────────

const FLOOR_PLAN_IDS = new Set(["floor_plan_2d", "top"]);

const isHeroAngle = (id: string, name: string): boolean => {
  const hay = `${id} ${name}`.toLowerCase();
  return /hero|front|main|three.?quarter|3\/4/.test(hay);
};

// ── Compiler ──────────────────────────────────────────────────────────────────

export function compileDeckSpec(inputs: CompileDeckInputs): DeckSpec {
  const { project, parsedBrief, elements, renders, kit, materials } = inputs;
  const brief = parsedBrief ?? {};
  const presentation: RenderPresentation = isRenderPresentation(inputs.renderPresentation)
    ? inputs.renderPresentation
    : DEFAULT_RENDER_PRESENTATION;
  const selectedIds = inputs.selectedRenderIds ? new Set(inputs.selectedRenderIds) : null;
  const featuredIds = new Set(inputs.featuredRenderIds ?? []);

  const clientName =
    kit.client.name ?? (nonEmpty(brief.brand?.name) ? brief.brand.name : "Client");
  const agencyName = kit.agency.name ?? "Agency";
  const projectName = nonEmpty(project?.name)
    ? (project!.name as string)
    : nonEmpty(brief.brand?.name)
      ? `${brief.brand.name} Booth`
      : "Booth Proposal";

  const primaryFootprint = brief.spatial?.footprints?.[0];
  const boothSize = inputs.boothSizeLabel ?? primaryFootprint?.size ?? "TBD";
  const primaryShow = brief.events?.shows?.[0];
  const showName = nonEmpty(brief.events?.primaryShow)
    ? brief.events.primaryShow
    : nonEmpty(primaryShow?.name)
      ? primaryShow.name
      : undefined;
  const dateLabel = nonEmpty(primaryShow?.dates)
    ? primaryShow.dates
    : new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const slides: SlideSpec[] = [];
  let sectionNumber = 0;
  const pushSection = (title: string, subtitle?: string) => {
    sectionNumber += 1;
    slides.push({ layout: "section", number: sectionNumber, title, subtitle });
  };

  // ── Cover ──────────────────────────────────────────────────────────────
  slides.push({
    layout: "cover",
    eyebrow: ["Booth Design Proposal", showName].filter(nonEmpty).join(" · "),
    title: projectName,
    subtitle: [clientName, boothSize !== "TBD" ? `${boothSize} booth` : null]
      .filter(nonEmpty)
      .join(" · "),
  });

  // ── The Ask ────────────────────────────────────────────────────────────
  const facts: FactRow[] = [];
  if (showName) {
    facts.push({
      label: "Show",
      value: [showName, primaryShow?.location].filter(nonEmpty).join(" — "),
    });
  }
  if (boothSize !== "TBD") {
    facts.push({
      label: "Footprint",
      value: primaryFootprint?.sqft
        ? `${boothSize} · ${primaryFootprint.sqft.toLocaleString("en-US")} sq ft`
        : boothSize,
    });
  }
  const budgetBrief = brief.budget ?? {};
  if (typeof budgetBrief.perShow === "number" && budgetBrief.perShow > 0) {
    facts.push({ label: "Budget", value: `${money(budgetBrief.perShow)} per show` });
  } else if (budgetBrief.range?.min && budgetBrief.range?.max) {
    facts.push({
      label: "Budget",
      value: `${money(budgetBrief.range.min)} – ${money(budgetBrief.range.max)}`,
    });
  }
  if (brief.spatial?.modular === true) {
    facts.push({ label: "Build", value: "Modular / reconfigurable system" });
  }

  const objectives: string[] = [];
  if (nonEmpty(brief.objectives?.primary)) objectives.push(clamp(brief.objectives.primary, 160));
  for (const o of brief.objectives?.secondary ?? []) {
    if (nonEmpty(o)) objectives.push(clamp(o, 160));
  }

  const audiences = (brief.audiences ?? [])
    .filter((a: any) => nonEmpty(a?.name))
    .slice(0, 4)
    .map((a: any) => ({
      name: a.name as string,
      description: clamp(a.description ?? "", 110),
    }));

  if (facts.length || objectives.length || audiences.length) {
    pushSection("The Ask", "What the brief calls for");
    slides.push({
      layout: "briefSummary",
      title: "What we heard",
      facts,
      objectives: objectives.slice(0, 4),
      audiences,
    });
  }

  // ── The Concept ────────────────────────────────────────────────────────
  const bigIdea = elementData(elements, "bigIdea");
  const cards: ElementCard[] = [];
  for (const key of GRID_ELEMENT_KEYS) {
    const data = elementData(elements, key);
    if (!data) continue;
    const card = distillElement(key, data);
    if (card) cards.push(card);
  }

  const hasConcept = !!bigIdea && nonEmpty(bigIdea.headline);
  const hasGrid = cards.length >= 2;
  if (hasConcept || hasGrid) {
    pushSection("The Concept", hasConcept ? clamp(bigIdea.headline, 60) : undefined);
  }
  if (hasConcept) {
    const points = [
      bigIdea.strategicPosition,
      bigIdea.differentiation,
      bigIdea.coreTension,
      ...(Array.isArray(bigIdea.briefAlignment) ? bigIdea.briefAlignment : []),
    ]
      .filter(nonEmpty)
      .slice(0, 3)
      .map((p: string) => clamp(p, 140));
    slides.push({
      layout: "concept",
      headline: bigIdea.headline,
      subheadline: nonEmpty(bigIdea.subheadline) ? bigIdea.subheadline : undefined,
      narrative: clamp(bigIdea.narrative ?? "", 520),
      points,
    });
  }
  if (hasGrid) {
    slides.push({
      layout: "elementGrid",
      title: "The experience, in six moves",
      cards: cards.slice(0, 6),
    });
  }

  // ── The Space ──────────────────────────────────────────────────────────
  const spatial = elementData(elements, "spatialStrategy");
  const currentRenders = renders.filter(
    (r) => r.is_current && nonEmpty(r.public_url) && (!selectedIds || selectedIds.has(r.angle_id)),
  );
  const floorPlan = currentRenders.find((r) => FLOOR_PLAN_IDS.has(r.angle_id));
  const viewRenders = currentRenders.filter((r) => !FLOOR_PLAN_IDS.has(r.angle_id));

  // Pick the config matching the primary footprint (never blindly configs[0]
  // when a match exists — the configs[0] hardcode is a known platform bug).
  const spatialConfig = spatial?.configs?.length
    ? spatial.configs.find((c: any) => c?.footprintSize === boothSize) ?? spatial.configs[0]
    : null;
  const zones = (spatialConfig?.zones ?? [])
    .filter((z: any) => nonEmpty(z?.name) && typeof z?.sqft === "number")
    .map((z: any) => ({
      name: z.name as string,
      sqft: z.sqft as number,
      note: nonEmpty(z.notes) ? clamp(z.notes, 70) : undefined,
    }));

  const hasSpatial = zones.length > 0 || !!floorPlan;
  const hasRenders = viewRenders.length > 0;
  const videoInput = inputs.video && nonEmpty(inputs.video.url) ? inputs.video : null;
  const videoSlide: VideoSlide | null = videoInput
    ? {
        layout: "video",
        title: "Walkthrough",
        videoUrl: videoInput.url,
        posterUrl: nonEmpty(videoInput.posterUrl) ? videoInput.posterUrl : undefined,
        caption: nonEmpty(videoInput.label) ? clamp(videoInput.label, 80) : "Booth walkthrough",
        durationSec:
          typeof videoInput.durationSec === "number" && videoInput.durationSec > 0
            ? videoInput.durationSec
            : undefined,
      }
    : null;
  if (hasSpatial || hasRenders || videoSlide) {
    pushSection("The Space", boothSize !== "TBD" ? `${boothSize} footprint` : undefined);
  }
  if (hasSpatial) {
    slides.push({
      layout: "spatial",
      title: "Zone program",
      boothSize,
      totalSqft: spatialConfig?.totalSqft ?? primaryFootprint?.sqft ?? undefined,
      image: floorPlan
        ? { url: floorPlan.public_url, label: floorPlan.angle_name || "Floor plan" }
        : undefined,
      zones: zones.slice(0, 8),
    });
  }

  const toSlot = (r: DeckRenderImage): ImageSlot => ({
    url: r.public_url,
    label: r.angle_name || "View",
  });
  const pushFull = (slot: ImageSlot) =>
    slides.push({ layout: "renderFull", image: slot, caption: slot.label });
  /** Group slots `size` at a time; a lone leftover gets its own full slide. */
  const pushGrids = (slots: ImageSlot[], size: 2 | 4) => {
    for (let i = 0; i < slots.length; i += size) {
      const group = slots.slice(i, i + size);
      if (group.length === 1) {
        pushFull(group[0]);
      } else {
        const grid: RenderGridSlide = {
          layout: "renderGrid",
          title: "Around the booth",
          images: group,
        };
        slides.push(grid);
      }
    }
  };

  if (hasRenders) {
    // Hero first, full bleed (the walkthrough clip follows it), then
    // featured renders full bleed, then the rest per presentation.
    const heroIdx = viewRenders.findIndex((r) => isHeroAngle(r.angle_id, r.angle_name));
    const hero = viewRenders[heroIdx >= 0 ? heroIdx : 0];
    const rest = viewRenders.filter((r) => r !== hero);

    slides.push({
      layout: "renderFull",
      image: { url: hero.public_url, label: hero.angle_name || "Hero view" },
      caption: hero.angle_name || "Hero view",
    });
    if (videoSlide) slides.push(videoSlide);

    const featured = rest.filter((r) => featuredIds.has(r.angle_id));
    const others = rest.filter((r) => !featuredIds.has(r.angle_id));
    for (const r of featured) pushFull(toSlot(r));

    const slots = others.map(toSlot);
    switch (presentation) {
      case "full":
        for (const slot of slots) pushFull(slot);
        break;
      case "mixed":
        pushGrids(slots, 2);
        break;
      case "grid":
      default:
        pushGrids(slots, 4);
        break;
    }
  } else if (videoSlide) {
    slides.push(videoSlide);
  }

  // ── The Investment ─────────────────────────────────────────────────────
  const budgetLogic = elementData(elements, "budgetLogic");
  const budgetRows = (budgetLogic?.allocation ?? [])
    .filter((a: any) => nonEmpty(a?.category) && typeof a?.amount === "number")
    .map((a: any) => ({
      category: a.category as string,
      amount: a.amount as number,
      percentage: typeof a.percentage === "number" ? a.percentage : undefined,
      description: nonEmpty(a.description) ? clamp(a.description, 90) : undefined,
    }));
  const hasBudget = budgetRows.length > 0 && typeof budgetLogic?.totalPerShow === "number";

  const materialRows = (materials?.categories ?? [])
    .filter((c) => nonEmpty(c?.name))
    .map((c) => ({
      category: c.name,
      summary: clamp(
        (c.items ?? [])
          .map((i) => i?.name)
          .filter(nonEmpty)
          .join(", "),
        110,
      ),
      subtotal: typeof c.subtotal === "number" ? c.subtotal : undefined,
    }));
  const hasMaterials = materialRows.length > 0;

  if (hasBudget || hasMaterials) {
    pushSection("The Investment", "Where the budget works hardest");
  }
  if (hasBudget) {
    slides.push({
      layout: "budget",
      title: "Budget allocation",
      rows: budgetRows.slice(0, 8),
      total: budgetLogic.totalPerShow,
      totalLabel: "Total per show",
    });
  }
  if (hasMaterials) {
    slides.push({
      layout: "materials",
      title: "Materials & build",
      rows: materialRows.slice(0, 8),
      total: typeof materials?.grandTotal === "number" ? materials.grandTotal : undefined,
      note: nonEmpty(materials?.notes) ? clamp(materials!.notes!, 160) : undefined,
    });
  }

  // Next steps — generic-but-specific: reference the real show + client.
  slides.push({
    layout: "nextSteps",
    title: "From concept to show floor",
    steps: [
      { title: "Review this concept", detail: `Walkthrough with the ${clientName} team — direction, scope, and priorities.` },
      { title: "Approve the direction", detail: "Lock the design language, hero moment, and footprint program." },
      { title: "Engineering drawings", detail: "Detailed construction documents, structural review, and material specs." },
      { title: "Production", detail: "Fabrication, graphics, AV integration, and staging pre-build." },
      { title: "Show services", detail: showName ? `Logistics, install & dismantle at ${showName}.` : "Logistics, install & dismantle on site." },
    ],
    timelineNote: showName
      ? `Targeting ${showName}${nonEmpty(primaryShow?.dates) ? ` · ${primaryShow.dates}` : ""}`
      : undefined,
  });

  // ── Closing ────────────────────────────────────────────────────────────
  // ParsedBrief has no first-class contacts block; probe the loose shape a
  // few parsers emit and fall back to the agency name alone.
  const rawContacts = Array.isArray(brief.contacts) ? brief.contacts : [];
  const contacts = rawContacts
    .filter((c: any) => nonEmpty(c?.name))
    .slice(0, 3)
    .map((c: any) => ({
      name: c.name as string,
      email: nonEmpty(c.email) ? c.email : undefined,
      phone: nonEmpty(c.phone) ? c.phone : undefined,
    }));

  slides.push({
    layout: "closing",
    headline: "Let's build it.",
    subline: `${agencyName} × ${clientName}`,
    contacts,
  });

  return {
    meta: {
      projectName,
      clientName,
      agencyName,
      boothSize,
      showName,
      dateLabel,
    },
    slides,
  };
}
