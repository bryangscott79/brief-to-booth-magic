// enrich-spatial — auto-populate structural metadata + sculptural
// features for an existing spatial layout.
//
// Phase 2 of the spatial-as-design-source rebuild. Phase 1 added
// structuralForm / featureDescription / intent / materialIds to
// zones and a BoothFeature array to spatialData, but those fields
// were entirely user-authored. New projects came in with zones that
// only had names and percentages — generic across brands.
//
// This function takes the current spatialData plus the brand brief
// and the hero installation and asks an LLM to fill in:
//   • Per-zone: structuralForm + featureDescription + intent +
//     materialIds (binding the existing materials catalog)
//   • Top-level: 3–6 sculptural BoothFeatures anchored to zones,
//     each with a form type, a real shape, a height range, a
//     description rooted in the brand language, and a material
//     binding from the catalog
//
// The LLM is given the existing zones (so it can't invent new ones
// or move them — that's the canvas's job), the catalog (so material
// refs are stable ids), and explicit constraint guidance for each
// formType. Output is structured via function-calling so we get
// strict JSON back with no chance of free-form drift.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callGemini } from "../_shared/ai-gateway.ts";
import { buildUsageContext } from "../_shared/usage-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      parsedBrief,
      bigIdea,
      heroInstallation,
      spatialStrategy,
      boothDimensions,
    } = await req.json();

    if (!spatialStrategy || typeof spatialStrategy !== "object") {
      return new Response(
        JSON.stringify({ error: "spatialStrategy is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Pull the active config (the first one — Spatial step's primary).
    // The client treats this as canonical for the canvas; enrichment
    // operates on it directly.
    const config = spatialStrategy.configs?.[0];
    if (!config || !Array.isArray(config.zones)) {
      return new Response(
        JSON.stringify({ error: "spatialStrategy.configs[0].zones missing" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Normalize the materials catalog so the LLM sees stable ids it
    // can reference. The legacy materialsAndMood entries don't always
    // have ids, so we mint them deterministically (matching the
    // client-side mapping in SpatialPlanner / PromptGenerator).
    const rawMaterials = Array.isArray(spatialStrategy.materialsAndMood)
      ? (spatialStrategy.materialsAndMood as Array<Record<string, unknown>>)
      : [];
    const materialsCatalog = rawMaterials.map((m, i) => ({
      id: (m.id as string) ?? `mat_${i}`,
      name:
        (m.name as string) ?? (m.material as string) ?? `Material ${i + 1}`,
      description: (m.description as string) ?? (m.feel as string) ?? "",
    }));

    // The LLM sees a compact view of zones — just the fields it
    // needs to author metadata. We send id + name + sqft + position
    // hints + booth dims so it can reason about layout, but we don't
    // include extras (heightFt, shape, etc.) that the user owns.
    const zonesForLLM = config.zones.map((z: Record<string, unknown>) => ({
      id: z.id,
      name: z.name,
      sqft: z.sqft,
      percentage: z.percentage,
      position: z.position,
    }));

    const brandName = parsedBrief?.brand?.name ?? "the brand";
    const headline = bigIdea?.headline ?? "";
    const heroSummary = heroInstallation
      ? [
          heroInstallation.name && `Hero installation: "${heroInstallation.name}"`,
          heroInstallation.concept && `Concept: ${heroInstallation.concept}`,
          heroInstallation.physicalForm?.structure &&
            `Structure: ${heroInstallation.physicalForm.structure}`,
          heroInstallation.physicalForm?.materials?.length &&
            `Materials: ${heroInstallation.physicalForm.materials.join(", ")}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "(No hero installation defined yet.)";

    const prompt = `You are a senior trade-show exhibit designer enriching a SPATIAL LAYOUT with structural identity. The zones already exist. The footprint is fixed. Your job is to assign every zone a STRUCTURAL FORM, write a VISUAL BRIEF and an INTENT for each, bind MATERIALS from the brand's catalog, and propose 3–6 sculptural FEATURES that bring the booth to life.

BRAND: ${brandName}
BIG IDEA HEADLINE: ${headline}

${heroSummary}

BOOTH FOOTPRINT: ${boothDimensions?.footprintLabel ?? `${boothDimensions?.width}' × ${boothDimensions?.depth}'`} (${boothDimensions?.totalSqft ?? "unknown"} sq ft)

ZONES (do NOT add, remove, rename, or reposition):
${JSON.stringify(zonesForLLM, null, 2)}

MATERIALS CATALOG (use these ids when binding):
${JSON.stringify(materialsCatalog, null, 2)}

═══════════════════════════════════════
PER ZONE — fill in:
═══════════════════════════════════════

structuralForm — one of:
  • "open"      — no walls (sampling counters, demo islands, lounges without canopies)
  • "enclosed"  — 4 walls + ceiling (photo chambers, AV rooms, meeting suites)
  • "canopy"    — overhead structure with open sides (covered lounges, shaded hospitality)
  • "alcove"    — 3 walls open on the aisle side (welcome stations, kiosk corners)
  • "platform"  — raised floor with no walls (DJ stages, presentation decks, elevated demos)
  • "tower"     — vertical sculpture, footprint << height (brand markers, totems, beacons)

featureDescription — 1–2 sentences describing what the zone LOOKS like. Brand-specific visual language. Reference real materials, colors, finishes. NOT generic — must read as the brand.

intent — 1 sentence on what visitors DO here. Action-led. Tie to the brand's emotional pitch.

materialIds — array of material ids from the catalog that this zone uses. Bind 1–3 per zone, no more. Use the actual id strings.

═══════════════════════════════════════
FEATURES — propose 3 to 6 sculptural objects:
═══════════════════════════════════════

Each feature must be:
  • Anchored to a zone (set zoneId to one of the zone ids above)
  • Positioned (x, y) inside that zone's footprint (front-left = 0,0;
    x runs left→right along WIDTH, y runs front→back along DEPTH)
  • Shaped via formType + shape — pick the right combination:

  formType options:
    "tower"     — vertical sculpture (footprint << height). Use shape: {kind:"circle", radius: 1–2}
    "ribbon"    — curving LED/fabric path. Use shape: {kind:"ribbon", path: [{x,y}, …], thickness: 1–2}.
                  Path is 3–5 points in feature-local coords.
    "archway"   — gateway between zones. Use shape: {kind:"rect", width: 4–10, depth: 0.5–1}
    "canopy"    — overhead shade. Use shape: {kind:"ellipse", radiusX: 3–6, radiusY: 2–5}
    "sculpture" — freeform 3D. Use shape: {kind:"polygon", points: 4–8 vertices in local coords}
    "screen"    — LED wall / projection surface. Use shape: {kind:"rect", width: 6–12, depth: 0.5}
    "totem"     — branded signage column. Use shape: {kind:"circle", radius: 0.5–1.5}
    "platform"  — raised stage. Use shape: {kind:"rect", width: 4–10, depth: 3–8}
    "bar"       — service counter. Use shape: {kind:"rect", width: 5–10, depth: 1–2}
    "kiosk"     — small enclosed booth. Use shape: {kind:"rect", width: 2–4, depth: 2–4}

  baseHeightFt + topHeightFt — feet off the floor. Canopies start at 8+; platforms at 0; ribbons can hang (base 6–8); towers from 0 to 12–18.

  description — brand-specific visual language. Reference real form, real material. NOT "a cool tower" — instead "iridescent dichroic ribbon weaving from welcome to photo chamber, embedded with cobalt LED neon".

  materialIds — array of material ids from the catalog (1–3).

Avoid generic "feature wall" suggestions. Lean into what makes THIS brand distinct. Place features where they'd actually drive flow — totems flanking welcome, sculptures at hero zones, ribbons connecting zones visually.

Return STRICT JSON via the spatial_enrichment tool call. No prose.`;

    const result = await callGemini({
      usage: await buildUsageContext(req, "enrich-spatial").catch(
        () => undefined,
      ),
      model: "google/gemini-2.5-pro",
      messages: [
        {
          role: "system",
          content:
            "You are a senior trade-show exhibit designer. Your output drives an image-generation pipeline, so be precise, brand-specific, and avoid generic language. Return structured JSON via the provided tool — never prose.",
        },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "spatial_enrichment",
            description:
              "Enriched zone metadata + a list of sculptural features anchored to those zones.",
            parameters: {
              type: "object",
              properties: {
                zones: {
                  type: "array",
                  description:
                    "One entry per existing zone. The id must match an input zone id exactly.",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      structuralForm: {
                        type: "string",
                        enum: [
                          "open",
                          "enclosed",
                          "canopy",
                          "alcove",
                          "platform",
                          "tower",
                        ],
                      },
                      featureDescription: { type: "string" },
                      intent: { type: "string" },
                      materialIds: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    required: [
                      "id",
                      "structuralForm",
                      "featureDescription",
                      "intent",
                      "materialIds",
                    ],
                    additionalProperties: false,
                  },
                },
                features: {
                  type: "array",
                  description:
                    "3 to 6 sculptural objects placed in the booth. Anchor each to a zone via zoneId.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      formType: {
                        type: "string",
                        enum: [
                          "tower",
                          "ribbon",
                          "archway",
                          "canopy",
                          "sculpture",
                          "screen",
                          "totem",
                          "platform",
                          "bar",
                          "kiosk",
                        ],
                      },
                      zoneId: { type: "string" },
                      x: { type: "number" },
                      y: { type: "number" },
                      baseHeightFt: { type: "number" },
                      topHeightFt: { type: "number" },
                      shape: {
                        type: "object",
                        description:
                          "Discriminated by `kind`. See spec — match formType to the right shape family.",
                        properties: {
                          kind: {
                            type: "string",
                            enum: [
                              "rect",
                              "circle",
                              "ellipse",
                              "polygon",
                              "ribbon",
                            ],
                          },
                          width: { type: "number" },
                          depth: { type: "number" },
                          radius: { type: "number" },
                          radiusX: { type: "number" },
                          radiusY: { type: "number" },
                          thickness: { type: "number" },
                          points: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                x: { type: "number" },
                                y: { type: "number" },
                              },
                              required: ["x", "y"],
                              additionalProperties: false,
                            },
                          },
                          path: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                x: { type: "number" },
                                y: { type: "number" },
                              },
                              required: ["x", "y"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["kind"],
                        additionalProperties: false,
                      },
                      description: { type: "string" },
                      materialIds: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    required: [
                      "name",
                      "formType",
                      "zoneId",
                      "x",
                      "y",
                      "baseHeightFt",
                      "topHeightFt",
                      "shape",
                      "description",
                      "materialIds",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ["zones", "features"],
              additionalProperties: false,
            },
          },
        },
      ],
      toolChoice: {
        type: "function",
        function: { name: "spatial_enrichment" },
      },
    });

    const enrichment = result.toolCalls?.[0]?.arguments ?? null;
    if (!enrichment) {
      return new Response(
        JSON.stringify({ error: "LLM returned no enrichment" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Mint feature ids on the server so the client doesn't have to.
    // Format matches the client's local id scheme used in
    // SpatialCanvas.handleAddFeature: feat_<timestamp36>_<rand>.
    const palette = ["#a78bfa", "#f59e0b", "#22d3ee", "#f472b6", "#34d399", "#fb923c"];
    const features = (enrichment.features ?? []).map(
      (f: Record<string, unknown>, i: number) => ({
        ...f,
        id: `feat_${Date.now().toString(36)}_${i}_${Math.random()
          .toString(36)
          .slice(2, 6)}`,
        colorHex: palette[i % palette.length],
      }),
    );

    return new Response(
      JSON.stringify({
        enrichment: {
          zones: enrichment.zones ?? [],
          features,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("enrich-spatial error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
