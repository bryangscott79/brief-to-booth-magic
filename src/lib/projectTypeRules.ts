/**
 * PROJECT TYPE RULES ENGINE
 * ─────────────────────────────────────────────────────────────────────────
 * This is the single source of truth for how project type changes every
 * string, label, camera instruction, atmosphere description, scale block,
 * and compliance block in the prompt generation pipeline.
 *
 * Rule: NO hardcoded "trade show booth" language anywhere in prompt
 * generation. All language must route through this engine.
 *
 * To add a new project type: add a rule set to PROJECT_TYPE_RULES below.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ProjectTypeId } from "./projectTypes";

// ─── UNIT SYSTEM HELPERS ──────────────────────────────────────────────────────

/** Same shape as BoothDimensions.measurementSystem; aliased here so this
 *  file doesn't have to import from spatialUtils (circular dep risk). */
export type MeasurementSystem = "imperial" | "metric";

/** Conversion constants. We standardize on storing widths/depths in the
 *  project's NATIVE units (feet for imperial, meters for metric) and only
 *  convert when printing for the model. */
const M_TO_FT = 3.28084;
const SQM_TO_SQFT = 10.76391041671;

/** Linear feet → meters. */
const ftToM = (ft: number) => ft / M_TO_FT;

/** A pair like (8, 12) feet → "2.4-3.6 m" or "8-12 ft" depending on system. */
function rangeLabel(ftLow: number, ftHigh: number, system: MeasurementSystem): string {
  if (system === "metric") {
    const lo = ftToM(ftLow);
    const hi = ftToM(ftHigh);
    return `${lo.toFixed(1)}-${hi.toFixed(1)} m`;
  }
  return `${ftLow}-${ftHigh} feet`;
}

/** Single linear value: 5.5 ft → "1.7 m" or "5.5 ft". */
function linearLabel(ft: number, system: MeasurementSystem): string {
  return system === "metric" ? `${ftToM(ft).toFixed(1)} m` : `${ft} feet`;
}

/** Native-unit linear label: takes the project's native number directly. */
function nativeLinear(n: number, system: MeasurementSystem): string {
  return system === "metric" ? `${n} m` : `${n} feet`;
}

/** Native-unit area label: 36 sqm or 388 sq ft. */
function nativeArea(nativeArea: number, system: MeasurementSystem): string {
  return system === "metric" ? `${nativeArea} sqm` : `${nativeArea} sq ft`;
}

/** Native-area number derived from sqft + system. Metric projects store
 *  sqft as the canonical area; we convert back for native display. */
function nativeAreaNumber(sqft: number, system: MeasurementSystem): number {
  return system === "metric"
    ? Math.round((sqft / SQM_TO_SQFT) * 10) / 10
    : Math.round(sqft);
}

/** Classify booth type from native-area sqft. Boundaries chosen so a
 *  6m × 6m (36 sqm ≈ 388 sqft) booth — the canonical "small island"
 *  in metric markets — classifies as "island", not "inline".
 *
 *  We split on the GREATER of the two interpretations:
 *  • inline: < 18 sqm AND < 200 sqft (about 6m × 3m or 10 × 20 ft)
 *  • peninsula: middle range (one open end)
 *  • island: ≥ 36 sqm OR ≥ 400 sqft (open on all sides)
 *
 *  When the brief explicitly states booth type, that wins over this
 *  heuristic — see resolveBoothType() below. */
function inferBoothType(
  sqft: number,
  system: MeasurementSystem,
): "inline" | "peninsula" | "island" {
  const sqm = sqft / SQM_TO_SQFT;
  if (system === "metric") {
    if (sqm >= 36) return "island";
    if (sqm >= 18) return "peninsula";
    return "inline";
  }
  if (sqft >= 400) return "island";
  if (sqft >= 200) return "peninsula";
  return "inline";
}

/** Resolve booth type with an optional brief-provided override. */
export function resolveBoothType(
  sqft: number,
  system: MeasurementSystem,
  briefBoothType?: string | null,
): "inline" | "peninsula" | "island" {
  const t = (briefBoothType ?? "").toLowerCase().trim();
  if (t === "inline" || t === "peninsula" || t === "island") return t;
  return inferBoothType(sqft, system);
}

// ─── CORE RULE SET INTERFACE ──────────────────────────────────────────────────

export interface ProjectTypeRules {
  /**
   * The primary noun for this project type used in prompts.
   * e.g. "trade show booth", "brand activation", "red carpet premiere build"
   */
  structureNoun: string;

  /**
   * Short context label for UI and compliance blocks. The system
   * argument tells the formatter which unit symbols to print —
   * metric projects must say "6m × 6m (36 sqm)", not "6' × 6'
   * (388 sq ft)". Without this, the prompt mixed units and the
   * image model rendered the wrong size.
   * e.g. "25' × 25' Booth", "6m × 6m booth", "Festival Activation"
   */
  sizeLabel: (w: number, d: number, sqft: number, system: MeasurementSystem) => string;

  /**
   * Physical scale context block injected into every prompt.
   * Replaces the PHYSICAL SCALE CONSTRAINTS block for non-booth types.
   * Unit-aware so metric projects get meters/sqm throughout.
   */
  scaleBlock: (w: number, d: number, sqft: number, system: MeasurementSystem) => string;

  /**
   * Camera instructions per angle ID. Unit-aware so camera
   * distances render in the project's native units.
   */
  cameraInstructions: Record<
    string,
    (w: number, d: number, system: MeasurementSystem) => string
  >;

  /**
   * Camera scale hint (distance, framing guidance). Unit-aware
   * for the same reasons.
   */
  cameraScaleHint: (
    footprintLabel: string,
    angleId: string,
    system: MeasurementSystem,
  ) => string;

  /**
   * Atmosphere/people description for the rendered scene.
   */
  atmosphereBlock: string;

  /**
   * Environment context — what surrounds the structure.
   */
  environmentContext: string;

  /**
   * Style/quality reference line.
   */
  styleReference: string;

  /**
   * Negative prompt additions specific to this type.
   */
  negativeAdditions: string;

  /**
   * Opening line of the main prompt.
   */
  promptOpener: (
    angleName: string,
    sizeLabel: string,
    brandName: string,
    brandCategory: string
  ) => string;

  /**
   * Compliance block header text. The size label already carries
   * the correct unit symbols (handled upstream); sqft remains the
   * canonical area number for any downstream sizing math.
   */
  complianceHeader: (sizeLabel: string, sqft: number, system: MeasurementSystem) => string;

  /**
   * Hero generation suffix (replaces "trade show booth" in generate-hero).
   */
  heroGenSuffix: string;

  /**
   * Feedback refinement prefix (replaces "trade show booth image" in feedback loop).
   */
  heroFeedbackPrefix: string;
}

// ─── RULES PER PROJECT TYPE ──────────────────────────────────────────────────

const RULES: Record<ProjectTypeId, ProjectTypeRules> = {

  // ─── TRADE SHOW BOOTH ──────────────────────────────────────────────────────
  trade_show_booth: {
    structureNoun: "trade show booth",
    sizeLabel: (w, d, sqft, system) => {
      const symbol = system === "metric" ? "m" : "'";
      const areaLabel = nativeArea(nativeAreaNumber(sqft, system), system);
      return `${w}${symbol} × ${d}${symbol} (${areaLabel})`;
    },
    scaleBlock: (w, d, sqft, system) => {
      // Height bands by booth class. Tied to industry-typical fascia
      // limits: 8–12 ft for inline (low convention ceiling), 12–16 ft
      // for peninsula, 16–20 ft for island. Same ranges in metric.
      const boothType = inferBoothType(sqft, system);
      const ht =
        boothType === "island"
          ? rangeLabel(16, 20, system)
          : boothType === "peninsula"
          ? rangeLabel(12, 16, system)
          : rangeLabel(8, 12, system);
      const scale =
        boothType === "island"
          ? "large island booth"
          : boothType === "peninsula"
          ? "mid-size peninsula booth"
          : "small inline booth";
      const totalAreaNative = nativeAreaNumber(sqft, system);
      const areaLabel = nativeArea(totalAreaNative, system);
      const shoulderWidth = system === "metric" ? 0.6 : 2; // m / ft per person
      const widthPeople = Math.max(1, Math.round(w / shoulderWidth));
      const depthPeople = Math.max(1, Math.round(d / shoulderWidth));
      // Size reference uses sqm thresholds so metric projects don't
      // misread an "island" as a living room.
      const sqm = sqft / SQM_TO_SQFT;
      const sizeReference =
        sqm < 18 ? "large living room"
        : sqm < 50 ? "small apartment or large retail unit"
        : sqm < 100 ? "large apartment or small retail store"
        : "boutique retail space";
      // Convention aisle width — 10 ft / 3 m typical.
      const aisleLabel = system === "metric" ? "3 m" : "10-foot";
      // Visitor cap — roughly one person per 4.6 sqm (50 sqft).
      const maxVisitors = Math.round(sqft / 50);
      return `PHYSICAL SCALE CONSTRAINTS (CRITICAL — strictly enforce these dimensions):

EXACT DIMENSIONS:
- Width: ${w} ${system === "metric" ? "meters" : "feet"} (${widthPeople} people shoulder-to-shoulder across)
- Depth: ${d} ${system === "metric" ? "meters" : "feet"} (${depthPeople} people in a row front-to-back)
- Total area: ${areaLabel}
- This is a ${boothType} booth (open on ${
        boothType === "island"
          ? "ALL four sides — no perimeter walls along the aisles"
          : boothType === "peninsula"
          ? "three sides — one shared back wall, three aisle frontages"
          : "one side — single aisle frontage, back and sides closed"
      })

STRUCTURE HEIGHT:
- Maximum fascia/canopy height: ${ht}
- This is a ${scale}
- Convention center ceiling visible above the booth structure

HUMAN SCALE CALIBRATION:
- Average visitor height: 5'8" (1.7 m)
- Shoulder width: ${linearLabel(2, system)} per person
- Standing conversation group: ${linearLabel(4, system)} diameter circle
- 6-10 visitors visible, focused zones

Size reference: roughly the size of a ${sizeReference}. Comfortable but NOT cavernous.

WHAT TO AVOID:
- Do NOT render this as a mega-exhibit or CES-scale installation
- Do NOT make the ceiling/fascia exceed ${ht}
- Do NOT show more than ${maxVisitors} visitors (one per ${linearLabel(50, system).replace("feet", "sq ft").replace("m", "sqm")} — roughly)
- Do NOT make architectural elements feel warehouse-scale
- Do NOT add excessive empty floor space — a ${areaLabel} booth should feel appropriately dense

AISLE CONTEXT:
- ${aisleLabel} wide convention aisles on open sides
- Adjacent booths visible at edges of frame
- Convention center environment (not isolated studio shot)`;
    },
    cameraInstructions: {
      hero_34: (w, d, system) => {
        const symbol = system === "metric" ? "m" : "'";
        return `Camera positioned at 45 degrees front-left, eye level (${linearLabel(5.5, system)}), showing the full ${w}${symbol} × ${d}${symbol} booth with hero installation as focal point`;
      },
      top: (w, d, system) => {
        const symbol = system === "metric" ? "m" : "'";
        return `Camera directly overhead, looking straight down at the ${w}${symbol} × ${d}${symbol} floor plan. Perfect orthographic bird's-eye view.`;
      },
      front: (w, _d, system) =>
        `Camera at eye level (${linearLabel(5.5, system)}), centered on the main entry, capturing the full ${nativeLinear(w, system)} front facade`,
      left: (_w, d, system) =>
        `Camera at eye level, positioned at 90 degrees to the left side, showing the full ${nativeLinear(d, system)} depth`,
      right: (_w, d, system) =>
        `Camera at eye level, positioned at 90 degrees to the right side, showing the full ${nativeLinear(d, system)} depth`,
      back: (w, _d, system) =>
        `Camera at eye level, positioned behind the booth showing service areas and the back of the ${nativeLinear(w, system)} structure`,
      detail_hero: (_w, _d, system) =>
        `Camera at medium distance (${rangeLabel(15, 20, system)}), focused on the central hero installation, showing interaction`,
      detail_lounge: (_w, _d, system) =>
        `Camera at medium distance (${rangeLabel(10, 15, system)}), focused on the lounge/meeting area, showing conversation`,
    },
    cameraScaleHint: (footprintLabel, angleId, system) => {
      // Parse the native-unit number off the front of the footprint
      // label (e.g. "6m × 6m" → 6, "30' × 50'" → 30).
      const w = parseInt(footprintLabel.split("×")[0]) || (system === "metric" ? 6 : 30);
      const distFt = Math.round(w * (system === "metric" ? M_TO_FT * 1.5 : 1.5));
      const distLabel = linearLabel(distFt, system);
      const symbol = system === "metric" ? "m" : "'";
      if (angleId === "hero_34") return `Camera at 45°, positioned ${distLabel} from booth center. The full ${w}${symbol} width should fill ~70% of frame width. Fascia text should be readable.`;
      if (angleId === "top") return `Orthographic overhead view. Booth fills 80% of frame. No perspective distortion.`;
      return `Eye-level, positioned ${distLabel} from the ${angleId.replace("_", " ")} face. Full structure visible.`;
    },
    atmosphereBlock: "8-12 people naturally distributed: some engaging with the hero installation, others in conversation in the lounge, staff at reception. Convention center environment visible in background.",
    environmentContext: "Professional trade show / convention center floor with carpet, overhead industrial lighting, neighboring booths visible at frame edges, aisle crowds in background.",
    styleReference: "Architectural visualization quality (Gensler/Rockwell Group level). Photorealistic materials. Clean editorial lighting. Professional trade show environment.",
    negativeAdditions: "oversized booth, mega-exhibit scale, warehouse scale, too large, excessive empty space, open field, outdoor environment",
    promptOpener: (angleName, sizeLabel, brandName, brandCategory) =>
      `Generate a photorealistic ${angleName.toLowerCase()} of a ${sizeLabel} trade show booth for ${brandName}, a ${brandCategory} company.`,
    complianceHeader: (sizeLabel, sqft, system) => {
      // sizeLabel already includes native units + area in parentheses
      // (e.g. "6m × 6m (36 sqm)"), so the redundant "(${sqft} sq ft)"
      // suffix was the source of the imperial/metric collision the
      // user reported. Anchor the header on the native label only,
      // with the booth type spelled out so the model can't infer
      // "inline" from a size-only number.
      const boothType = inferBoothType(sqft, system);
      return `BOOTH SIZE: ${sizeLabel} — ${boothType.toUpperCase()} booth. DO NOT exceed this scale.`;
    },
    heroGenSuffix: "Generate a photorealistic 16:9 architectural visualization of this trade show booth. The booth must appear as the correct physical size — not a mega-exhibit.",
    heroFeedbackPrefix: "Based on this trade show booth image, apply the following feedback and generate an improved version:",
  },

  // ─── LIVE BRAND ACTIVATION ────────────────────────────────────────────────
  // Activations are predominantly imperial (US festivals); the system
  // parameter is accepted for interface conformance and used only to
  // re-symbolize the inline footprint label when metric.
  live_brand_activation: {
    structureNoun: "brand activation",
    sizeLabel: (w, d, sqft, system) => {
      if (sqft > 0) return `${sqft.toLocaleString()} sq ft activation footprint`;
      const symbol = system === "metric" ? "m" : "'";
      return `${w}${symbol} × ${d}${symbol} activation space`;
    },
    scaleBlock: (w, d, sqft, _system) => {
      const isFestival = sqft > 3000;
      const isUrban = sqft <= 1500;
      const context = isFestival ? "festival grounds" : isUrban ? "urban streetscape" : "event venue grounds";
      return `ACTIVATION SCALE CONSTRAINTS (CRITICAL):

PHYSICAL FOOTPRINT:
- Total activation area: ${sqft > 0 ? `${sqft.toLocaleString()} square feet` : `${w}' × ${d}'`}
- Environment type: Outdoor / semi-outdoor ${context}
- This is a brand activation — NOT a trade show booth. Do NOT render convention hall, carpet, or neighboring booths.

STRUCTURE SCALE:
- Maximum structural height: ${sqft > 3000 ? "35-40" : sqft > 1500 ? "20-30" : "12-20"} feet
- ${isFestival ? "Festival-scale installation — dramatic, visible from 200+ feet away" : "Urban activation — human scale, street-level, approachable"}
- Open sky or tent overhead (NOT convention center ceiling)

HUMAN SCALE:
- Average person height: 5'8" (1.7m)
- Crowd density: ${isFestival ? "festival crowd energy — groups of 20-100+ people" : "urban flow — clusters of 5-20 people"}
- ${sqft > 0 ? `${Math.round(sqft / 30)} people maximum visible in frame` : "20-40 people visible in frame"}

ENVIRONMENT:
- ${isFestival ? "Festival grounds: dusty/grassy terrain, competing structures visible in distance, festival crowd, natural + artificial light mix" : "Urban environment: street, sidewalk, or plaza — city architecture visible in background"}
- Natural daylight OR dramatic nighttime lighting
- Open air — conveys freedom, energy, and scale

WHAT TO AVOID:
- Do NOT show convention hall, trade show aisles, or carpet flooring
- Do NOT show neighboring exhibit booths
- Do NOT show overhead industrial convention lighting
- Do NOT make this look like a trade show booth or exhibit`;
    },
    cameraInstructions: {
      hero_34: (_w, _d, _system) => `Camera at ground level (5 feet), positioned at 45° front-left, showing the full activation footprint with the hero installation as the dominant focal point. Wide environmental context visible.`,
      top: (w, d, system) => {
        const symbol = system === "metric" ? "m" : "'";
        return `Aerial drone view, directly overhead, showing the full ${w > 0 ? `${w}${symbol} × ${d}${symbol}` : "activation"} footprint and surrounding environment layout.`;
      },
      front: (w, _d, system) => `Camera at street/crowd level (5 feet), centered on the primary entrance/face, capturing the full ${w > 0 ? (system === "metric" ? `${w}-meter` : `${w}-foot`) : ""} front of the activation with crowds and environmental context.`,
      left: (_w, _d, _system) => `Camera at eye level, 90° to the left, showing the full depth of the activation space with environmental context.`,
      right: (_w, _d, _system) => `Camera at eye level, 90° to the right, showing the activation footprint depth and surrounding environment.`,
      back: (_w, _d, _system) => `Camera at eye level, rear of the activation space showing service access and secondary guest egress points.`,
      detail_hero: (_w, _d, _system) => "Medium shot (20-30 feet), focused on the hero installation with crowd interaction visible, immersive detail.",
      detail_lounge: (_w, _d, _system) => "Medium shot (15-20 feet), focused on the social/lounge zone with guests relaxing and interacting.",
    },
    cameraScaleHint: (_footprintLabel, angleId, _system) => {
      if (angleId === "hero_34") return "Camera at ground level, wide 16:9 frame. Hero structure fills 40-60% of frame. Sky or venue ceiling visible above. Crowd energy at edges.";
      if (angleId === "top") return "Aerial overhead — drone perspective. Full footprint visible with environmental context. Natural ground texture (grass, pavement, gravel) visible.";
      return "Eye-level, wide frame showing activation in its environment. Surrounding venue/streetscape provides context.";
    },
    atmosphereBlock: "20-50 people in organic crowd formation: some queuing for the experience, others taking photos, groups socializing. Energy is electric and festival-like. Staff in branded uniforms weaving through crowd.",
    environmentContext: "Open-air event environment — festival grounds, urban plaza, or outdoor venue. Natural sky visible. Surrounding festival structures or city buildings provide scale context. Not a convention center.",
    styleReference: "Architectural visualization quality meets editorial event photography. Photorealistic materials with dramatic atmospheric lighting. Cinematic composition. NOT a trade show render.",
    negativeAdditions: "trade show booth, convention center, exhibit hall, carpet flooring, neighboring booths, overhead industrial truss lighting, indoor fluorescent environment, corporate event center",
    promptOpener: (angleName, sizeLabel, brandName, brandCategory) =>
      `Generate a photorealistic ${angleName.toLowerCase()} of a ${sizeLabel} for ${brandName}, a ${brandCategory} brand.`,
    complianceHeader: (sizeLabel, _sqft, _system) => `ACTIVATION FOOTPRINT: ${sizeLabel} — render this as an outdoor brand activation event, NOT a trade show booth.`,
    heroGenSuffix: "Generate a photorealistic 16:9 architectural/event visualization of this brand activation. This is an outdoor experiential build — NOT a trade show booth. Show crowd energy, open sky, and immersive scale.",
    heroFeedbackPrefix: "Based on this brand activation event image, apply the following feedback and generate an improved version:",
  },

  // ─── PERMANENT INSTALLATION ───────────────────────────────────────────────
  permanent_installation: {
    structureNoun: "permanent installation",
    sizeLabel: (w, d, sqft, system) => {
      if (sqft > 0) return `${sqft.toLocaleString()} sq ft`;
      const symbol = system === "metric" ? "m" : "'";
      return `${w}${symbol} × ${d}${symbol}`;
    },
    scaleBlock: (w, d, sqft, _system) => `SPACE SCALE CONSTRAINTS:

PHYSICAL DIMENSIONS:
- Total area: ${sqft > 0 ? `${sqft.toLocaleString()} square feet` : `${w}' × ${d}'`}
- This is a permanent branded environment — NOT a temporary exhibit or pop-up
- Architectural quality finishes and construction throughout

STRUCTURE:
- Fixed architectural elements: walls, floors, ceilings — all permanently constructed
- High-quality materials appropriate for daily traffic over 5-10 year lifespan
- Ceiling height: ${sqft > 5000 ? "14-25" : sqft > 2000 ? "12-16" : "9-12"} feet
- Full architectural integration — no truss, no tension fabric, no temporary structures

ENVIRONMENT:
- Permanent retail, museum, visitor center, or corporate environment
- Polished architectural photography aesthetic
- Natural light from windows or skylights where applicable
- No temporary event structures visible`,
    cameraInstructions: {
      hero_34: (_w, _d, _system) => `Camera at 45° front-left, eye level (5 feet), showing the primary space with hero installation as architectural focal point.`,
      top: (_w, _d, _system) => `Architectural plan oblique — overhead view at slight angle showing spatial layout and circulation.`,
      front: (_w, _d, _system) => `Camera centered on the primary entrance experience, eye level, capturing the full arrival moment.`,
      left: (_w, _d, _system) => `Camera at eye level, showing the left elevation and spatial depth.`,
      right: (_w, _d, _system) => `Camera at eye level, showing the right elevation and spatial depth.`,
      back: (_w, _d, _system) => `Camera showing the rear of the space — back wall treatment, exit design, or secondary feature.`,
      detail_hero: (_w, _d, _system) => "Medium shot, focused on the hero installation or primary feature, showing material quality and scale.",
      detail_lounge: (_w, _d, _system) => "Intimate medium shot of seating or social zone, showing hospitality and human scale.",
    },
    cameraScaleHint: (_footprintLabel, angleId, _system) => {
      if (angleId === "hero_34") return "Architectural photography framing — natural light, hero element centered, depth of space conveyed.";
      if (angleId === "top") return "High-quality architectural overhead or oblique view. Space fills frame with room context visible.";
      return "Editorial architectural photography. Clean, resolved aesthetic. No temporary elements.";
    },
    atmosphereBlock: "6-10 visitors naturally distributed throughout the space: browsing, engaging with interactive elements, staff available but not intrusive. Space feels alive but not crowded.",
    environmentContext: "Permanent architectural environment — flagship retail, museum gallery, visitor center, or brand HQ. High-quality construction. Permanent lighting design. Long-lasting materials throughout.",
    styleReference: "Architectural photography quality (Diller Scofidio / Snøhetta level). Photorealistic materials. Natural and designed artificial lighting. Permanent, resolved aesthetic.",
    negativeAdditions: "temporary structures, tension fabric, trade show truss, exhibit booth, pop-up store, convention center, unfinished edges, exposed wiring",
    promptOpener: (angleName, sizeLabel, brandName, brandCategory) =>
      `Generate a photorealistic ${angleName.toLowerCase()} of a ${sizeLabel} permanent branded installation for ${brandName}, a ${brandCategory} brand.`,
    complianceHeader: (sizeLabel, _sqft, _system) => `INSTALLATION SIZE: ${sizeLabel} — render as permanent, architectural quality space. NOT a temporary exhibit.`,
    heroGenSuffix: "Generate a photorealistic 16:9 architectural visualization of this permanent installation. This is a high-quality, permanent branded environment — architectural photography aesthetic.",
    heroFeedbackPrefix: "Based on this permanent installation image, apply the following feedback and generate an improved version:",
  },

  // ─── FILM / EVENT PREMIERE ────────────────────────────────────────────────
  film_premiere: {
    structureNoun: "premiere event build",
    sizeLabel: (w, _d, sqft, system) => {
      if (sqft > 0) return `${sqft.toLocaleString()} sq ft premiere build`;
      const symbol = system === "metric" ? "m" : "'";
      return `${w}${symbol} red carpet`;
    },
    scaleBlock: (w, _d, sqft, _system) => `PREMIERE EVENT SCALE:

PHYSICAL SETUP:
- ${w > 0 ? `Red carpet / arrival corridor: ${w} linear feet` : "Full premiere arrival experience"}
- Total footprint: ${sqft > 0 ? `${sqft.toLocaleString()} sq ft` : "premiere venue scale"}
- This is a film/event premiere — NOT a trade show or pop-up store

ENVIRONMENT TYPE:
- Glamorous venue interior OR dramatic outdoor arrival
- Professional lighting design: key lights, fill, color gels, uplighting
- Step-and-repeat backdrops, floral installations, theatrical set pieces
- Red carpet, velvet ropes, stanchions as appropriate

HUMAN SCALE:
- Celebrities, press, and VIP guests in formal/semi-formal attire
- Photographers with cameras visible at press line
- Security, talent handlers, event staff in black attire
- Fan energy if exterior arrival sequence

WHAT TO AVOID:
- Do NOT show trade show carpet, convention center, or exhibit booths
- Do NOT show daytime casual crowd
- Do NOT show generic event center ballroom setup without transformation`,
    cameraInstructions: {
      hero_34: (_w, _d, _system) => `Camera at 45°, slightly elevated (7 feet) to capture the full premiere arrival experience — red carpet, step-and-repeat, and crowd energy.`,
      top: (_w, _d, _system) => `Aerial overhead of the premiere venue setup showing red carpet layout, press line positions, and venue transformation.`,
      front: (_w, _d, _system) => `Camera at eye level at the far end of the red carpet, looking toward the venue entrance — capturing full arrival grandeur.`,
      left: (_w, _d, _system) => `Camera from the press bank position, eye level, capturing the step-and-repeat wall and celebrity arrival moment.`,
      right: (_w, _d, _system) => `Camera from fan zone perspective, capturing the star's interaction with press and fans.`,
      back: (_w, _d, _system) => `Camera showing the talent entrance/green room arrival — private, exclusive, behind-the-scenes glamour.`,
      detail_hero: (_w, _d, _system) => "Medium shot of the hero installation or primary set piece — showing theatrical craft and IP detail.",
      detail_lounge: (_w, _d, _system) => "Intimate VIP cocktail area — premium hospitality, brand integration, talent interaction.",
    },
    cameraScaleHint: (_footprintLabel, angleId, _system) => {
      if (angleId === "hero_34") return "Dramatic wide frame — red carpet fills lower third. Step-and-repeat/hero build is backdrop. Theatrical lighting active. Glamorous atmosphere.";
      if (angleId === "top") return "Overhead venue view — red carpet path clear, press positions marked, arrival architecture visible.";
      return "Cinematic framing — premiere glamour, theatrical lighting, celebrity atmosphere.";
    },
    atmosphereBlock: "Celebrities and VIPs arriving on the red carpet, photographers photographing from press bank, fans cheering from fan zones, event staff directing flow. Theatrical lighting creating a glamorous, cinematic atmosphere.",
    environmentContext: "Film premiere / entertainment event. Theatrical venue or iconic outdoor location. Dramatic event lighting, floral installations, step-and-repeat backdrops, red carpet. High-glamour atmosphere.",
    styleReference: "Getty Images premiere photography quality meets architectural event production visualization. Theatrical and glamorous. Editorial and cinematic. Red carpet energy.",
    negativeAdditions: "trade show booth, convention center, daytime casual crowd, generic ballroom without event styling, corporate meeting room, plain backdrop",
    promptOpener: (angleName, sizeLabel, brandName, brandCategory) =>
      `Generate a photorealistic ${angleName.toLowerCase()} of a ${sizeLabel} event experience for ${brandName}, a ${brandCategory} brand.`,
    complianceHeader: (sizeLabel, _sqft, _system) => `PREMIERE BUILD: ${sizeLabel} — render as a theatrical, glamorous film/event premiere. NOT a trade show or corporate event.`,
    heroGenSuffix: "Generate a photorealistic 16:9 visualization of this premiere event build. This is a theatrical, glamorous film/event premiere experience — cinematic and dramatic, NOT a trade show booth.",
    heroFeedbackPrefix: "Based on this premiere event visualization, apply the following feedback and generate an improved version:",
  },

  // ─── GAME RELEASE ACTIVATION ─────────────────────────────────────────────
  game_release_activation: {
    structureNoun: "game launch activation",
    sizeLabel: (w, d, sqft, system) => {
      if (sqft > 0) return `${sqft.toLocaleString()} sq ft game launch activation`;
      const symbol = system === "metric" ? "m" : "'";
      return `${w}${symbol} × ${d}${symbol}`;
    },
    scaleBlock: (_w, _d, sqft, _system) => `GAME ACTIVATION SCALE:

PHYSICAL FOOTPRINT:
- Total activation area: ${sqft > 0 ? `${sqft.toLocaleString()} sq ft` : "large-scale activation"}
- This is a game launch event activation — NOT a trade show booth
- Epic scale: designed to feel like stepping inside the game's universe

ENVIRONMENT:
- Convention or arena floor, OR large outdoor festival activation
- RGB LED lighting throughout — game-appropriate color palette
- Massive LED walls, gaming screens, and spectator displays
- Epic architectural scale appropriate to a major game launch

HUMAN SCALE:
- Gamers, content creators, press, and fans
- Casual attire (gaming community aesthetic)
- ${sqft > 0 ? `${Math.round(sqft / 25)} people maximum in frame` : "100+ people at peak activation"}
- Queue management visible — high demand activation

WHAT TO AVOID:
- Do NOT show convention carpet or generic trade show setup without the immersive game world build
- Do NOT use corporate or professional event aesthetics — this is FOR gamers, BY the gaming culture`,
    cameraInstructions: {
      hero_34: (_w, _d, _system) => "Camera at 45° front-left, eye level (5.5 feet), capturing the full activation with LED lighting, giant screens, and the game world immersion. Crowd energy visible.",
      top: (_w, _d, _system) => "Overhead aerial view showing the full activation footprint, gaming station layout, and world-build scenic design.",
      front: (_w, _d, _system) => "Camera centered on the primary entrance to the game world — the arrival moment that transports fans into the IP universe.",
      left: (_w, _d, _system) => "Side view showing the full depth of the activation and the scale of the scenic world build.",
      right: (_w, _d, _system) => "Opposite side showing secondary gaming zones, spectator areas, and community spaces.",
      back: (_w, _d, _system) => "Rear of the activation — developer/content creator backstage area or secondary fan experience.",
      detail_hero: (_w, _d, _system) => "Close-up medium shot of the hero gaming installation, playable demo zone, or hero set piece from the game world.",
      detail_lounge: (_w, _d, _system) => "Community hub zone — developer meet-and-greet area, cosplay zone, or fan community gathering space.",
    },
    cameraScaleHint: (_footprintLabel, angleId, _system) => {
      if (angleId === "hero_34") return "Epic wide frame — hero installation dominates. RGB LED wash. Crowd energy. Giant screen content visible. Game world atmosphere.";
      if (angleId === "top") return "Overhead — full game world layout visible, gaming stations clearly positioned, scenic world-build visible from above.";
      return "Gaming event visualization — RGB LED environment, epic scale, immersive game world aesthetic.";
    },
    atmosphereBlock: "100+ gamers, content creators, and fans in casual attire: some playing at stations, others watching on spectator screens, groups cosplaying, content creators filming. RGB LED lighting creating epic gaming atmosphere.",
    environmentContext: "Epic game launch activation — convention floor, arena, or large outdoor festival. RGB LED environment, massive gaming screens, world-build scenic design. High-energy gaming community atmosphere.",
    styleReference: "Architectural event visualization meets gaming culture photography. Epic scale. RGB LED dramatic lighting. Immersive game world aesthetic. NOT corporate — FOR the gaming community.",
    negativeAdditions: "trade show booth, corporate meeting room, bland exhibition hall, suit-wearing crowd, convention carpet without world-build, generic signage",
    promptOpener: (angleName, sizeLabel, brandName, brandCategory) =>
      `Generate a photorealistic ${angleName.toLowerCase()} of a ${sizeLabel} for ${brandName}, a ${brandCategory} company.`,
    complianceHeader: (sizeLabel, _sqft, _system) => `ACTIVATION FOOTPRINT: ${sizeLabel} — render as epic game launch activation. NOT a trade show booth. Game world immersion required.`,
    heroGenSuffix: "Generate a photorealistic 16:9 visualization of this game launch activation. This is an epic, immersive game world activation — NOT a trade show booth. RGB LED environment, massive screens, gaming community energy.",
    heroFeedbackPrefix: "Based on this game launch activation image, apply the following feedback and generate an improved version:",
  },

  // ─── ARCHITECTURAL BRIEF ─────────────────────────────────────────────────
  architectural_brief: {
    structureNoun: "architectural space",
    sizeLabel: (w, d, sqft, system) => {
      if (sqft > 0) return `${sqft.toLocaleString()} sq ft`;
      const symbol = system === "metric" ? "m" : "'";
      return `${w}${symbol} × ${d}${symbol}`;
    },
    scaleBlock: (_w, _d, sqft, _system) => `ARCHITECTURAL SCALE:

SPACE SPECIFICATIONS:
- Total area: ${sqft > 0 ? `${sqft.toLocaleString()} square feet` : "architectural scale space"}
- This is a permanent architectural brief — NOT a trade show or event build
- Full architectural construction: walls, floors, ceilings, structural systems

CONSTRUCTION QUALITY:
- Permanent, high-quality architecture
- Professional architectural materials and finishes
- Designed for daily use over 20+ year building lifespan
- Ceiling height: ${sqft > 10000 ? "18-40" : sqft > 3000 ? "12-18" : "9-14"} feet with full architectural detail

WHAT TO RENDER:
- Architectural visualization quality matching top-tier firms
- Natural light + designed artificial lighting
- Human figures for scale — professionals, visitors, or occupants
- Material texture and spatial depth prominent

WHAT TO AVOID:
- Do NOT render as a trade show, event, or temporary structure
- Do NOT show convention center, truss, or event equipment`,
    cameraInstructions: {
      hero_34: (_w, _d, _system) => "Camera at 45°, eye level (5 feet), capturing the primary architectural space with key design features as focal point.",
      top: (_w, _d, _system) => "Architectural floor plan oblique — showing spatial organization, circulation, and design language from above.",
      front: (_w, _d, _system) => "Camera at eye level, centered on the primary architectural facade or entrance — capturing the full arrival experience.",
      left: (_w, _d, _system) => "Left elevation perspective — architectural side view showing depth, fenestration, and material palette.",
      right: (_w, _d, _system) => "Right elevation perspective — opposite architectural side with full depth and context.",
      back: (_w, _d, _system) => "Rear elevation or secondary space — service access, back-of-house, or secondary feature space.",
      detail_hero: (_w, _d, _system) => "Medium shot focused on the key architectural feature — detail, material quality, and spatial craftsmanship.",
      detail_lounge: (_w, _d, _system) => "Intimate social or seating area — human scale, material quality, and spatial comfort evident.",
    },
    cameraScaleHint: (_footprintLabel, angleId, _system) => {
      if (angleId === "hero_34") return "Architectural photography framing — Ezra Stoller / Iwan Baan quality. Natural and artificial light. Materials prominent. Human figures for scale.";
      if (angleId === "top") return "Architectural overhead — clean, resolved. Circulation legible. Material zones visible.";
      return "Award-winning architectural photography. Clean, editorial. Material quality prominent.";
    },
    atmosphereBlock: "5-8 people naturally inhabiting the space: professionals working, visitors exploring, small groups in conversation. Space feels purposeful and alive. Architecture as background to human life.",
    environmentContext: "Permanent architectural space — commercial interior, hospitality environment, civic building, or branded headquarters. Full architectural construction. Natural light. High-quality materials throughout.",
    styleReference: "Architectural photography quality (Iwan Baan / Hufton+Crow level). Photorealistic, award-worthy visualization. Natural and artificial light. Material texture at forefront.",
    negativeAdditions: "trade show booth, temporary structure, convention center, exhibit hall, pop-up, event truss, carpet tiles, generic office building",
    promptOpener: (angleName, sizeLabel, brandName, brandCategory) =>
      `Generate a photorealistic architectural visualization — ${angleName.toLowerCase()} — of a ${sizeLabel} space for ${brandName}, a ${brandCategory} brand.`,
    complianceHeader: (sizeLabel, _sqft, _system) => `SPACE: ${sizeLabel} — render as permanent, high-quality architecture. NOT a trade show or event structure.`,
    heroGenSuffix: "Generate a photorealistic 16:9 architectural visualization of this space. This is a permanent architectural brief — award-quality architectural photography aesthetic. NOT a trade show booth.",
    heroFeedbackPrefix: "Based on this architectural visualization, apply the following feedback and generate an improved version:",
  },
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Get the full rule set for a project type.
 * Falls back to trade_show_booth if type is unknown (future-proof).
 */
export function getRules(projectTypeId?: string | null): ProjectTypeRules {
  if (!projectTypeId) return RULES.trade_show_booth;
  return RULES[projectTypeId as ProjectTypeId] ?? RULES.trade_show_booth;
}

/**
 * Build the full scale constraints block for any project type.
 * `system` defaults to imperial for backward-compat with any caller
 * that hasn't been updated yet.
 */
export function buildScaleBlock(
  projectTypeId: string | null | undefined,
  width: number,
  depth: number,
  sqft: number,
  system: MeasurementSystem = "imperial",
): string {
  return getRules(projectTypeId).scaleBlock(width, depth, sqft, system);
}

/**
 * Get camera instructions for a specific angle and project type.
 */
export function getCameraInstructions(
  projectTypeId: string | null | undefined,
  angleId: string,
  width: number,
  depth: number,
  system: MeasurementSystem = "imperial",
): string {
  const rules = getRules(projectTypeId);
  const fn = rules.cameraInstructions[angleId];
  return fn
    ? fn(width, depth, system)
    : `Eye-level perspective of the ${rules.structureNoun}`;
}

/**
 * Get camera scale hint for a specific angle and project type.
 */
export function getCameraScaleHint(
  projectTypeId: string | null | undefined,
  footprintLabel: string,
  angleId: string,
  system: MeasurementSystem = "imperial",
): string {
  return getRules(projectTypeId).cameraScaleHint(footprintLabel, angleId, system);
}

/**
 * Build the prompt opener line.
 */
export function buildPromptOpener(
  projectTypeId: string | null | undefined,
  angleName: string,
  w: number,
  d: number,
  sqft: number,
  brandName: string,
  brandCategory: string,
  system: MeasurementSystem = "imperial",
): string {
  const rules = getRules(projectTypeId);
  const sizeLabel = rules.sizeLabel(w, d, sqft, system);
  return rules.promptOpener(angleName, sizeLabel, brandName, brandCategory);
}

/**
 * Build the compliance block header.
 */
export function buildComplianceHeader(
  projectTypeId: string | null | undefined,
  w: number,
  d: number,
  sqft: number,
  system: MeasurementSystem = "imperial",
): string {
  const rules = getRules(projectTypeId);
  const sizeLabel = rules.sizeLabel(w, d, sqft, system);
  return rules.complianceHeader(sizeLabel, sqft, system);
}
