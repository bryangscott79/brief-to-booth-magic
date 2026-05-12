// briefReadiness — score how well a project's content compiles into a
// tight image-generation prompt.
//
// The image model only renders what we feed it. The Eqvilent failure
// case the user reported (a 6m × 6m island brief rendering as a 6'×6'
// inline booth) was downstream of mixed-unit prompt assembly, but the
// underlying problem was harder: the system had no way to TELL the
// user where the brief was thin before they generated.
//
// This file is the pre-flight: a pure function that walks every step
// of the brief → content → spatial → prompt pipeline and returns a
// structured checklist with point-weighted scoring. The PromptGenerator
// surfaces it as a banner ("Brief 64/100 — three high-impact gaps"),
// and the SpatialPlanner surfaces it as a side panel. Each check has
// a `jumpTo` hint so the UI can route the user back to the right
// surface to fix the gap.
//
// Design rules:
//   • Pure: no React, no fetch, no DOM. Just data → report.
//   • Cheap: O(n) over zones/features; safe to recompute on every render.
//   • Honest: thresholds are calibrated against the kinds of prompts
//     that produced the best renders empirically. Scoring numbers are
//     defensible, not arbitrary.
//   • Helpful: every failed check carries a `fixHint` saying what to do.

import type { BoothDimensions } from "./spatialUtils";
import { resolveBoothType } from "./projectTypeRules";

// ─── Public API ────────────────────────────────────────────────────────────

export type CheckSeverity = "pass" | "warn" | "fail";

/**
 * A single readiness check. Every gap has an actionable fixHint and
 * a jumpTo target so the UI can take the user where the fix lives.
 */
export interface CheckResult {
  id: string;
  label: string;
  /** Point weight (out of 100 across the whole report). */
  weight: number;
  /** Points earned by this check on the current data. */
  earned: number;
  severity: CheckSeverity;
  message: string;
  fixHint?: string;
  /** Where in the app to fix the gap. The component layer maps this
   *  to a route via useProjectNavigate. */
  jumpTo?: {
    step:
      | "brief"
      | "review"
      | "elements"
      | "spatial"
      | "materials"
      | "prompts";
    detail?: string;
  };
}

export interface ReadinessReport {
  /** 0–100. Rounded to integer. */
  score: number;
  /** Group-level scores so the UI can show a section breakdown. */
  groups: Array<{
    id: string;
    label: string;
    earned: number;
    total: number;
    checks: CheckResult[];
  }>;
  /** Top 3 highest-weight failed/warned checks — surfaced as the
   *  "biggest gaps" callout in the readiness banner. */
  topGaps: CheckResult[];
}

export interface ReadinessInputs {
  brief: any | null;
  bigIdea: any | null;
  /** elements.interactiveMechanics.data.hero is the load-bearing field. */
  elements: any | null;
  /** spatialStrategy element data — configs[].zones, features,
   *  materialsAndMood, etc. */
  spatialData: any | null;
  boothDimensions: BoothDimensions | null;
}

// ─── The checker ───────────────────────────────────────────────────────────

export function evaluateBriefReadiness(
  inputs: ReadinessInputs,
): ReadinessReport {
  const groups: ReadinessReport["groups"] = [
    {
      id: "brief",
      label: "Brief fundamentals",
      ...runBriefChecks(inputs),
    },
    {
      id: "bigIdea",
      label: "Big idea + narrative",
      ...runBigIdeaChecks(inputs),
    },
    {
      id: "hero",
      label: "Hero installation",
      ...runHeroChecks(inputs),
    },
    {
      id: "spatial",
      label: "Spatial — zones + features",
      ...runSpatialChecks(inputs),
    },
    {
      id: "materials",
      label: "Materials & mood",
      ...runMaterialsChecks(inputs),
    },
  ];

  const totalEarned = groups.reduce((s, g) => s + g.earned, 0);
  const totalWeight = groups.reduce((s, g) => s + g.total, 0);
  const score = totalWeight > 0 ? Math.round((totalEarned / totalWeight) * 100) : 0;

  // Top 3 gaps = highest-weight checks that failed or warned.
  const failedOrWarned = groups
    .flatMap((g) => g.checks)
    .filter((c) => c.severity !== "pass")
    .sort((a, b) => (b.weight - b.earned) - (a.weight - a.earned));
  const topGaps = failedOrWarned.slice(0, 3);

  return { score, groups, topGaps };
}

// ─── Group runners ─────────────────────────────────────────────────────────

interface GroupOutput {
  checks: CheckResult[];
  earned: number;
  total: number;
}

function summarize(checks: CheckResult[]): GroupOutput {
  const earned = checks.reduce((s, c) => s + c.earned, 0);
  const total = checks.reduce((s, c) => s + c.weight, 0);
  return { checks, earned, total };
}

function runBriefChecks(inputs: ReadinessInputs): GroupOutput {
  const { brief, boothDimensions } = inputs;
  const checks: CheckResult[] = [];

  // Brand name
  checks.push(
    checkPresence({
      id: "brand.name",
      label: "Brand name",
      weight: 4,
      value: brief?.brand?.name,
      fixHint: "Add the brand name to the brief or upload a doc that mentions it.",
      jumpTo: { step: "brief", detail: "brand.name" },
    }),
  );

  // Brand category — drives prompt opener voice
  checks.push(
    checkPresence({
      id: "brand.category",
      label: "Brand category (industry)",
      weight: 3,
      value: brief?.brand?.category,
      fixHint:
        "Specify the company's industry (e.g. \"Quantitative Trading\"). The prompt opener uses this verbatim.",
      jumpTo: { step: "brief", detail: "brand.category" },
    }),
  );

  // Brand colors — at least 2 named; bonus for hex
  const colors: string[] = brief?.brand?.visualIdentity?.colors ?? [];
  const hexCount = colors.filter((c) => /#[0-9a-f]{3,8}/i.test(c)).length;
  if (colors.length >= 2 && hexCount >= 2) {
    checks.push(pass("brand.colors", "Brand colors (hex)", 8, `${colors.length} colors, ${hexCount} with hex.`));
  } else if (colors.length >= 2) {
    checks.push({
      id: "brand.colors",
      label: "Brand colors",
      weight: 8,
      earned: 5,
      severity: "warn",
      message: `${colors.length} colors named, but only ${hexCount} have hex codes.`,
      fixHint:
        "Convert color names to hex (e.g. \"#FF6B00\"). The model anchors materials to exact colors only when hex is present.",
      jumpTo: { step: "brief", detail: "brand.colors" },
    });
  } else {
    checks.push({
      id: "brand.colors",
      label: "Brand colors",
      weight: 8,
      earned: 0,
      severity: "fail",
      message: "Fewer than 2 brand colors captured.",
      fixHint: "Add at least primary + secondary brand colors (with hex codes).",
      jumpTo: { step: "brief", detail: "brand.colors" },
    });
  }

  // Footprint dimensions — required for everything downstream
  const fps = brief?.spatial?.footprints ?? [];
  if (Array.isArray(fps) && fps.length > 0 && fps[0]?.size && fps[0]?.sqft > 0) {
    checks.push(pass("spatial.footprint", "Footprint dimensions", 8, `${fps[0].size} (${fps[0].sqft} sqft).`));
  } else {
    checks.push({
      id: "spatial.footprint",
      label: "Footprint dimensions",
      weight: 8,
      earned: 0,
      severity: "fail",
      message: "No valid footprint size on the brief.",
      fixHint:
        "Brief must state booth size — e.g. \"20×20\", \"6m × 6m\", or \"400 sq ft\".",
      jumpTo: { step: "brief", detail: "spatial.footprint" },
    });
  }

  // Booth type — explicit or inferable
  const boothType = boothDimensions
    ? resolveBoothType(
        boothDimensions.totalSqft,
        boothDimensions.measurementSystem,
        (brief?.spatial as any)?.boothType,
      )
    : null;
  if (boothType) {
    const fromBrief = (brief?.spatial as any)?.boothType;
    checks.push(
      pass(
        "spatial.boothType",
        "Booth type (inline / peninsula / island)",
        4,
        fromBrief
          ? `Brief says: ${boothType}.`
          : `Inferred from area: ${boothType}.`,
      ),
    );
  } else {
    checks.push({
      id: "spatial.boothType",
      label: "Booth type",
      weight: 4,
      earned: 0,
      severity: "warn",
      message: "Can't determine booth type without dimensions.",
      fixHint: "Once footprint is set, booth type is auto-inferred (or read from brief.spatial.boothType when present).",
      jumpTo: { step: "brief", detail: "spatial.boothType" },
    });
  }

  // Creative avoid + embrace — drives negative prompt + style directives
  const avoid = brief?.creative?.avoid ?? [];
  const embrace = brief?.creative?.embrace ?? [];
  checks.push(
    minLength({
      id: "creative.avoid",
      label: "Things to AVOID (creative)",
      weight: 4,
      value: avoid,
      min: 2,
      fixHint:
        "List at least 2-3 things the brand explicitly does NOT want. These flow directly into the negative prompt.",
      jumpTo: { step: "review", detail: "creative.avoid" },
    }),
  );
  checks.push(
    minLength({
      id: "creative.embrace",
      label: "Things to EMBRACE (creative)",
      weight: 4,
      value: embrace,
      min: 2,
      fixHint:
        "List at least 2-3 design moves the brand DOES want. These shape the design-direction block in the prompt.",
      jumpTo: { step: "review", detail: "creative.embrace" },
    }),
  );

  return summarize(checks);
}

function runBigIdeaChecks(inputs: ReadinessInputs): GroupOutput {
  const { bigIdea } = inputs;
  const checks: CheckResult[] = [];

  checks.push(
    checkPresence({
      id: "bigIdea.headline",
      label: "Big idea headline",
      weight: 4,
      value: bigIdea?.headline,
      fixHint: "Generate or write a 1-sentence creative headline.",
      jumpTo: { step: "elements", detail: "bigIdea" },
    }),
  );

  const narrative = (bigIdea?.narrative ?? "").trim();
  if (narrative.length >= 200) {
    checks.push(pass("bigIdea.narrative", "Big idea narrative", 6, `${narrative.length} chars.`));
  } else if (narrative.length > 0) {
    checks.push({
      id: "bigIdea.narrative",
      label: "Big idea narrative",
      weight: 6,
      earned: 3,
      severity: "warn",
      message: `Narrative is only ${narrative.length} chars — the model needs more design direction.`,
      fixHint: "Aim for 200-400 chars of design-direction narrative. The prompt embeds the first 400 chars verbatim.",
      jumpTo: { step: "elements", detail: "bigIdea.narrative" },
    });
  } else {
    checks.push({
      id: "bigIdea.narrative",
      label: "Big idea narrative",
      weight: 6,
      earned: 0,
      severity: "fail",
      message: "No big-idea narrative captured.",
      fixHint:
        "Without narrative, the prompt's DESIGN DIRECTION block falls back to the headline only — the model has nothing to ground the visual.",
      jumpTo: { step: "elements", detail: "bigIdea.narrative" },
    });
  }

  return summarize(checks);
}

function runHeroChecks(inputs: ReadinessInputs): GroupOutput {
  const { elements } = inputs;
  const hero = elements?.interactiveMechanics?.data?.hero;
  const checks: CheckResult[] = [];

  checks.push(
    checkPresence({
      id: "hero.name",
      label: "Hero installation name",
      weight: 5,
      value: hero?.name,
      fixHint:
        "Name the centerpiece — e.g. \"The Orb of Eqvilence\". Reused verbatim in HERO INSTALLATION block.",
      jumpTo: { step: "elements", detail: "interactiveMechanics" },
    }),
  );

  const concept = (hero?.concept ?? "").trim();
  if (concept.length >= 80) {
    checks.push(pass("hero.concept", "Hero concept", 5, `${concept.length} chars.`));
  } else if (concept.length > 0) {
    checks.push({
      id: "hero.concept",
      label: "Hero concept",
      weight: 5,
      earned: 2,
      severity: "warn",
      message: `Concept is only ${concept.length} chars — the model needs more.`,
      fixHint: "Aim for 80-200 chars describing what the hero installation IS conceptually.",
      jumpTo: { step: "elements", detail: "interactiveMechanics.hero.concept" },
    });
  } else {
    checks.push({
      id: "hero.concept",
      label: "Hero concept",
      weight: 5,
      earned: 0,
      severity: "fail",
      message: "No hero concept written.",
      fixHint: "The hero's concept anchors the entire scene. Without it the model invents one.",
      jumpTo: { step: "elements", detail: "interactiveMechanics.hero.concept" },
    });
  }

  // Physical form: dimensions (renders as a hero-callout in the compliance block)
  checks.push(
    checkPresence({
      id: "hero.dimensions",
      label: "Hero physical dimensions",
      weight: 5,
      value: hero?.physicalForm?.dimensions,
      fixHint:
        "State the hero's real size (e.g. \"3.5m diameter sphere on a 4m round base, 4m total height\"). Without this the model guesses scale.",
      jumpTo: { step: "elements", detail: "interactiveMechanics.hero.physicalForm.dimensions" },
    }),
  );

  // Materials list on the hero
  const mats: string[] = hero?.physicalForm?.materials ?? [];
  if (mats.length >= 2) {
    checks.push(pass("hero.materials", "Hero materials", 5, `${mats.length} listed.`));
  } else {
    checks.push({
      id: "hero.materials",
      label: "Hero materials",
      weight: 5,
      earned: mats.length === 1 ? 2 : 0,
      severity: mats.length === 1 ? "warn" : "fail",
      message:
        mats.length === 0
          ? "No materials on the hero installation."
          : "Only 1 material — give the model more vocabulary.",
      fixHint:
        "List 2-4 materials with finishes (e.g. \"flexible LED panels\", \"matte black carbon fiber\", \"polished black aluminum\").",
      jumpTo: { step: "elements", detail: "interactiveMechanics.hero.physicalForm.materials" },
    });
  }

  // Structure/lighting prose
  const structure = (hero?.physicalForm?.structure ?? "").trim();
  if (structure.length > 0) {
    checks.push(pass("hero.structure", "Hero structural description", 5, `${structure.length} chars.`));
  } else {
    checks.push({
      id: "hero.structure",
      label: "Hero structural description",
      weight: 5,
      earned: 0,
      severity: "warn",
      message: "No structural description on the hero.",
      fixHint:
        "1-2 sentences on the hero's structural form / lighting strategy. Used in the visual-style block.",
      jumpTo: { step: "elements", detail: "interactiveMechanics.hero.physicalForm.structure" },
    });
  }

  return summarize(checks);
}

function runSpatialChecks(inputs: ReadinessInputs): GroupOutput {
  const { spatialData } = inputs;
  const checks: CheckResult[] = [];
  const zones: any[] = spatialData?.configs?.[0]?.zones ?? [];
  const features: any[] = (spatialData as any)?.features ?? [];

  // Zone count
  if (zones.length >= 3) {
    checks.push(pass("spatial.zoneCount", "Zone count", 4, `${zones.length} zones defined.`));
  } else {
    checks.push({
      id: "spatial.zoneCount",
      label: "Zone count",
      weight: 4,
      earned: zones.length === 0 ? 0 : 2,
      severity: zones.length === 0 ? "fail" : "warn",
      message: `Only ${zones.length} zones — most booths need 3-7.`,
      fixHint:
        "Generate the spatial layout from the brief (or add zones manually in the Spatial step).",
      jumpTo: { step: "spatial" },
    });
  }

  // Structural form coverage — % of zones with a structuralForm value
  const withStructural = zones.filter((z) => !!z.structuralForm).length;
  checks.push(
    coverageCheck({
      id: "spatial.structuralForm",
      label: "Structural form per zone",
      weight: 5,
      coverage: zones.length > 0 ? withStructural / zones.length : 0,
      thresholdPass: 0.8,
      thresholdWarn: 0.4,
      passMessage: `${withStructural}/${zones.length} zones tagged.`,
      failMessage:
        zones.length === 0
          ? "No zones to evaluate."
          : `${withStructural}/${zones.length} zones tagged — the model needs structural intent for the rest.`,
      fixHint:
        "Click each zone in the Spatial canvas and pick a structural form (open / enclosed / canopy / alcove / platform / tower) — or hit \"Suggest layout\".",
      jumpTo: { step: "spatial", detail: "structuralForm" },
    }),
  );

  // Visual brief coverage
  const withVisual = zones.filter((z) => !!z.featureDescription).length;
  checks.push(
    coverageCheck({
      id: "spatial.featureDescription",
      label: "Visual brief per zone",
      weight: 5,
      coverage: zones.length > 0 ? withVisual / zones.length : 0,
      thresholdPass: 0.7,
      thresholdWarn: 0.3,
      passMessage: `${withVisual}/${zones.length} zones described.`,
      failMessage:
        zones.length === 0
          ? "No zones to evaluate."
          : `${withVisual}/${zones.length} zones have a visual brief.`,
      fixHint:
        "Each zone needs a 1-2 sentence visual brief — what it LOOKS like. \"Suggest layout\" populates this from the brief.",
      jumpTo: { step: "spatial", detail: "featureDescription" },
    }),
  );

  // Intent coverage
  const withIntent = zones.filter((z) => !!z.intent).length;
  checks.push(
    coverageCheck({
      id: "spatial.intent",
      label: "Visitor intent per zone",
      weight: 4,
      coverage: zones.length > 0 ? withIntent / zones.length : 0,
      thresholdPass: 0.7,
      thresholdWarn: 0.3,
      passMessage: `${withIntent}/${zones.length} zones describe visitor intent.`,
      failMessage:
        zones.length === 0
          ? "No zones to evaluate."
          : `${withIntent}/${zones.length} zones describe what visitors DO.`,
      fixHint:
        "Each zone needs an intent sentence — what people do there. Drives the people/activity language in renders.",
      jumpTo: { step: "spatial", detail: "intent" },
    }),
  );

  // Features
  if (features.length > 0) {
    checks.push(
      pass(
        "spatial.features",
        "Sculptural features",
        4,
        `${features.length} feature(s) anchored.`,
      ),
    );
  } else {
    checks.push({
      id: "spatial.features",
      label: "Sculptural features",
      weight: 4,
      earned: 0,
      severity: "warn",
      message: "No sculptural features placed.",
      fixHint:
        "Add at least 1 tower / ribbon / canopy / sculpture / screen via the Spatial canvas — or hit \"Suggest layout\".",
      jumpTo: { step: "spatial", detail: "features" },
    });
  }

  return summarize(checks);
}

function runMaterialsChecks(inputs: ReadinessInputs): GroupOutput {
  const { spatialData } = inputs;
  const checks: CheckResult[] = [];
  const catalog: any[] = spatialData?.materialsAndMood ?? [];
  const zones: any[] = spatialData?.configs?.[0]?.zones ?? [];

  // Catalog size
  if (catalog.length >= 4) {
    checks.push(pass("materials.catalog", "Materials catalog", 5, `${catalog.length} entries.`));
  } else {
    checks.push({
      id: "materials.catalog",
      label: "Materials catalog",
      weight: 5,
      earned: Math.min(catalog.length, 3),
      severity: catalog.length === 0 ? "fail" : "warn",
      message:
        catalog.length === 0
          ? "No materials catalog."
          : `Only ${catalog.length} materials — most booths need 4-8 to feel distinctive.`,
      fixHint:
        "Generate the Materials & Mood element, or add materials manually. Each one should have a name + a 1-line feel description.",
      jumpTo: { step: "materials" },
    });
  }

  // Per-zone material binding coverage
  const bound = zones.filter((z) => Array.isArray(z.materialIds) && z.materialIds.length > 0).length;
  if (zones.length === 0) {
    checks.push({
      id: "materials.boundToZones",
      label: "Materials bound to zones",
      weight: 5,
      earned: 0,
      severity: "warn",
      message: "No zones to bind materials to.",
      fixHint: "Generate spatial layout first.",
      jumpTo: { step: "spatial" },
    });
  } else {
    checks.push(
      coverageCheck({
        id: "materials.boundToZones",
        label: "Materials bound to zones",
        weight: 5,
        coverage: bound / zones.length,
        thresholdPass: 0.6,
        thresholdWarn: 0.2,
        passMessage: `${bound}/${zones.length} zones bind to specific materials.`,
        failMessage: `${bound}/${zones.length} zones bind to specific materials.`,
        fixHint:
          "In the Spatial canvas, select a zone and click material chips in the metadata panel. The prompt uses bound materials when present, otherwise the whole palette (less precise).",
        jumpTo: { step: "spatial", detail: "materialIds" },
      }),
    );
  }

  return summarize(checks);
}

// ─── Check helpers ─────────────────────────────────────────────────────────

function checkPresence(opts: {
  id: string;
  label: string;
  weight: number;
  value: unknown;
  fixHint: string;
  jumpTo?: CheckResult["jumpTo"];
}): CheckResult {
  const present =
    typeof opts.value === "string"
      ? opts.value.trim().length > 0
      : !!opts.value;
  return {
    id: opts.id,
    label: opts.label,
    weight: opts.weight,
    earned: present ? opts.weight : 0,
    severity: present ? "pass" : "fail",
    message: present ? "Present." : "Missing.",
    fixHint: present ? undefined : opts.fixHint,
    jumpTo: present ? undefined : opts.jumpTo,
  };
}

function minLength(opts: {
  id: string;
  label: string;
  weight: number;
  value: unknown[];
  min: number;
  fixHint: string;
  jumpTo?: CheckResult["jumpTo"];
}): CheckResult {
  const n = Array.isArray(opts.value) ? opts.value.length : 0;
  if (n >= opts.min) {
    return {
      id: opts.id,
      label: opts.label,
      weight: opts.weight,
      earned: opts.weight,
      severity: "pass",
      message: `${n} item(s).`,
    };
  }
  return {
    id: opts.id,
    label: opts.label,
    weight: opts.weight,
    earned: n === 0 ? 0 : Math.round(opts.weight * (n / opts.min)),
    severity: n === 0 ? "fail" : "warn",
    message: `${n} item(s) — need ≥${opts.min}.`,
    fixHint: opts.fixHint,
    jumpTo: opts.jumpTo,
  };
}

function coverageCheck(opts: {
  id: string;
  label: string;
  weight: number;
  coverage: number;
  thresholdPass: number;
  thresholdWarn: number;
  passMessage: string;
  failMessage: string;
  fixHint: string;
  jumpTo?: CheckResult["jumpTo"];
}): CheckResult {
  const earned = Math.round(opts.weight * Math.min(1, opts.coverage));
  let severity: CheckSeverity;
  if (opts.coverage >= opts.thresholdPass) severity = "pass";
  else if (opts.coverage >= opts.thresholdWarn) severity = "warn";
  else severity = "fail";
  return {
    id: opts.id,
    label: opts.label,
    weight: opts.weight,
    earned,
    severity,
    message: severity === "pass" ? opts.passMessage : opts.failMessage,
    fixHint: severity === "pass" ? undefined : opts.fixHint,
    jumpTo: severity === "pass" ? undefined : opts.jumpTo,
  };
}

function pass(
  id: string,
  label: string,
  weight: number,
  message: string,
): CheckResult {
  return {
    id,
    label,
    weight,
    earned: weight,
    severity: "pass",
    message,
  };
}
