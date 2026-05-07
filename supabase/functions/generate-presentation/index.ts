// generate-presentation — multi-mode router for deck generation.
//
// MODES (selected via body.mode):
//   • undefined / "slides"  — original behavior, returns slide structures
//                             { slides: [{ title, bodyPoints, ... }] } used
//                             by the pptxgenjs proposal exporter.
//   • "designed-deck"       — Claude designs every slide as standalone
//                             HTML+CSS at 1920×1080. Returns
//                             { slides: [{ id, title, slideType, html }] }
//                             for the AI-designed deck flow.
//   • "ping"                — diagnostic: returns { ok: true, anthropicKey:
//                             "configured" | "missing" } without spending
//                             tokens. Used by the client's "Test connection".
//
// Why both modes live in this single function: Lovable's deployment
// pipeline did not pick up the separate generate-designed-deck function on
// repeated pushes, while generate-presentation is already deployed and
// reachable. Routing both through one URL avoids the deployment lag.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";
import { buildRagContext } from "../_shared/rag-helper.ts";

const DEPLOY_TOKEN = "2026-05-07-r5-image2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── PING handler ──────────────────────────────────────────────────────────

/**
 * Deep ping — when `validateKey` is true, hits the Anthropic API with a
 * 1-token request to verify the key value actually authenticates. Without
 * this, "configured" only meant "the secret exists" — the value could
 * still be revoked, mistyped, or for the wrong account.
 */
async function pingResponse(opts: { validateKey?: boolean } = {}) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const altKeys = ["LOVABLE_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"]
    .filter((name) => !!Deno.env.get(name));

  let keyStatus: "missing" | "configured" | "valid" | "invalid" = apiKey
    ? "configured"
    : "missing";
  let keyError: string | null = null;

  // Walk all candidate secrets and probe each. The first one that
  // authenticates with Anthropic wins — surface which key actually works
  // so the user knows whether their rotation landed on the right secret
  // name. Without this, a stale ANTHROPIC_API_KEY would mask a working
  // LOVABLE_API_KEY (or vice versa) and the user would think they were
  // truly broken.
  let validKeySource: string | null = null;
  if (opts.validateKey) {
    const candidates: Array<{ name: string; value: string }> = [];
    for (const name of ["ANTHROPIC_API_KEY", "LOVABLE_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"]) {
      const v = Deno.env.get(name);
      if (v && v.trim().length > 0) candidates.push({ name, value: v.trim() });
    }
    if (candidates.length === 0) {
      keyStatus = "missing";
    } else {
      let lastError: string | null = null;
      for (const cand of candidates) {
        try {
          const probe = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": cand.value,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-3-5-haiku-20241022",
              max_tokens: 1,
              messages: [{ role: "user", content: "hi" }],
            }),
          });
          if (probe.ok) {
            keyStatus = "valid";
            validKeySource = cand.name;
            break;
          }
          try {
            const body = await probe.json();
            lastError = body?.error?.message ?? `Anthropic returned ${probe.status}`;
          } catch {
            lastError = `Anthropic returned ${probe.status}`;
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
        }
      }
      if (keyStatus !== "valid") {
        keyStatus = "invalid";
        keyError = lastError;
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      function: "generate-presentation",
      deployToken: DEPLOY_TOKEN,
      modes: ["slides", "designed-deck", "ping"],
      anthropicKey: keyStatus,
      anthropicKeyError: keyError,
      validKeySource,
      alternativeKeysFound: altKeys,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// ─── Designed-deck handler ─────────────────────────────────────────────────

const DESIGNED_DECK_SYSTEM_PROMPT = `You are a senior brand designer at a top creative agency. You design high-end pitch decks for clients like Red Bull, Nike, Apple, Patagonia. Your decks WIN business because they look like work the brand themselves would publish, not like generic templates.

You produce slides as self-contained HTML documents. Each slide is a single \`<html>\` doc with inline \`<style>\` and \`<body>\`. The body has fixed dimensions of exactly 1920×1080 px (16:9). No external CSS, no JavaScript, no images that aren't provided in the input. Web fonts via @import from Google Fonts ARE allowed — use them.

# Your design principles (non-negotiable)

**Typography is the engine.**
- Pair a display font with a body font (e.g. Bricolage Grotesque + Inter, Fraunces + Inter, Söhne + Söhne Mono, Recoleta + Manrope, Migra + Inter).
- Hierarchy: massive display (96–200px) for the slide's one big idea, body (16–22px) for support, micro-caps (10–12px tracked) for labels.
- Never use more than two type families on a single deck.
- Numbers and stats get featured at SCALE — booth size, budget, expected leads. Treat them like billboards.

**The brand color carries weight.**
- Use the brand color as a PRIMARY element on at least 30% of slides — full-bleed background, large vertical bar, headline color. Not just an accent on a thin line.
- On non-brand-color slides, use it on micro-elements (numerals, italic emphasis) so the brand identity stays present.
- Pair brand color with deep neutrals (off-white #FAFAF7, near-black #0F0F0F or warm dark #1A1611). Avoid pure white #FFFFFF and pure black #000000 — they read cheap.

**Layouts vary.**
- Every slide should look DIFFERENT from the slide before it. Repeating the same template across the deck signals laziness.
- Mix: full-bleed image with overlay text, asymmetric two-column (60/40 not 50/50), centered hero with massive type, vertical sidebar of brand color with content offset, full-page color field with one number, photo-as-background with text in lower-left, etc.
- Never center-align everything. Centered is the lazy default — break it.

**Whitespace is design.**
- Margins: 80–120px from edges minimum. More on quiet slides.
- One dominant element per slide. Don't fill space.
- Avoid bullet-list slides where you can — convert bullets to a numbered grid, a horizontal flow, or restructured prose.

**Images are headlines, not decoration.**
- Render images come full-bleed or 70%+ of the canvas. Never as small thumbnails alongside body text.
- When using images: cover-fit, position to bias on the brand-relevant side, gradient overlay for text legibility.

**Brand fingerprints.**
- Read the brand POV and personality. A Red Bull deck should FEEL Red Bull — high energy, kinetic, bold red, athletic typography. A Patagonia deck should feel Patagonia — earnest, restrained, earthy palette, photo-driven.
- Use the project's "creative direction — embrace" / "avoid" lists as design direction, not just copy direction.

# Slide types you can produce

Pick the right type per slide. Don't repeat:

- \`title\` — Cover. Big. Brand name + project name + show + date. 70%+ brand color or full-bleed image.
- \`opportunity\` — The one challenge or insight. One sentence at 80–140px. Generous whitespace.
- \`big-idea\` — The strategic concept. Headline + 1 short paragraph + visual anchor.
- \`framework\` — Design principles, visitor journey, or experience pillars. Numbered grid (2x2, 3x1) — never bullets.
- \`hero-installation\` — Image-driven. Hero render full-bleed, name + concept overlay.
- \`spatial\` — Floor plan or zone diagram if available, otherwise a clean zone-allocation visual (% bars, sqft callouts).
- \`mechanics\` — Interactive activations. Card grid, each card a single mechanic with icon/photo + name + 1 line.
- \`storytelling\` — Content/digital approach. Editorial-feel typography, prose, no bullets.
- \`render-feature\` — A single render image, full-bleed, with a single short caption (≤8 words) lower-left or lower-right.
- \`investment\` — Budget. Single big number. Allocation as a horizontal stacked bar with category labels.
- \`closing\` — Next steps. Numbered CTAs (1, 2, 3). Quiet. Brand-color sign-off line.

# Constraints

- Each slide HTML is COMPLETE: \`<!DOCTYPE html>\` through \`</html>\`. No fragments.
- Body must be exactly 1920×1080 px. Use \`body { width: 1920px; height: 1080px; margin: 0; overflow: hidden; }\`.
- All units in px or rem (via \`html { font-size: 16px }\`). No vw/vh — viewport doesn't apply when we render to a fixed canvas.
- Inline only — no external stylesheets. Google Fonts via @import inside \`<style>\` is the ONE exception.
- When using a provided image URL, use it verbatim in \`<img src="...">\` — do not invent URLs.
- Don't put any link, script, or iframe inside slides.
- Output MUST be wrapped in the create_designed_deck tool call.

# The bar

Picture the slide on the wall of a creative director's office, projected at 4K, in the moment a client decision is being made. Would the work get a "yes"? If not, you're not done.`;

const DESIGNED_DECK_TOOL = {
  name: "create_designed_deck",
  description: "Return an array of designed HTML slides.",
  input_schema: {
    type: "object",
    properties: {
      slides: {
        type: "array",
        minItems: 1,
        maxItems: 18,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            slideType: {
              type: "string",
              enum: [
                "title",
                "opportunity",
                "big-idea",
                "framework",
                "hero-installation",
                "spatial",
                "mechanics",
                "storytelling",
                "render-feature",
                "investment",
                "closing",
                "custom",
              ],
            },
            html: { type: "string" },
            usedImageAngles: { type: "array", items: { type: "string" } },
          },
          required: ["id", "title", "slideType", "html"],
        },
      },
    },
    required: ["slides"],
  },
};

function buildDesignedDeckUserMessage(body: any): string {
  const brand = body.parsedBrief?.brand ?? {};
  const objectives = body.parsedBrief?.objectives ?? {};
  const spatial = body.parsedBrief?.spatial ?? {};
  const budget = body.parsedBrief?.budget ?? {};
  const audiences = body.parsedBrief?.audiences ?? [];
  const els = body.elements ?? {};
  const imageBlock = (body.imageUrls ?? [])
    .map((i: any) => `- ${i.angle}: ${i.url}`)
    .join("\n");
  const overridesBlock = body.deckOverrides
    ? Object.entries(body.deckOverrides)
        .map(([id, ovr]: any) => {
          const lines: string[] = [];
          if (ovr.title) lines.push(`title: ${ovr.title}`);
          if (ovr.narrative) lines.push(`narrative: ${ovr.narrative}`);
          if (ovr.bullets) lines.push(`bullets: ${ovr.bullets.join(" | ")}`);
          return `- ${id}: ${lines.join(" / ")}`;
        })
        .join("\n")
    : "";

  return `# Project context

PROJECT: ${body.projectName ?? brand.name ?? "Untitled"}
BRAND: ${brand.name ?? "—"} — ${brand.category ?? "—"}
BRAND POV: ${brand.pov ?? "—"}
BRAND PERSONALITY: ${(brand.personality ?? []).join(", ") || "—"}
BRAND COLORS (brief): ${(brand.visualIdentity?.colors ?? []).join(", ") || "—"}
BRAND VOICE — embrace: ${(body.parsedBrief?.creative?.embrace ?? []).join(", ") || "—"}
BRAND VOICE — avoid: ${(body.parsedBrief?.creative?.avoid ?? []).join(", ") || "—"}

PRIMARY OBJECTIVE: ${objectives.primary ?? "—"}
SECONDARY OBJECTIVES: ${(objectives.secondary ?? []).join("; ") || "—"}
DIFFERENTIATION GOALS: ${(objectives.differentiationGoals ?? []).join("; ") || "—"}

EVENTS: ${(body.parsedBrief?.events?.shows ?? []).map((s: any) => `${s.name}${s.location ? ` (${s.location})` : ""}`).join(", ") || "—"}
BOOTH SIZE: ${spatial.footprints?.[0]?.size ?? "TBD"} (${spatial.footprints?.[0]?.sqft ?? "TBD"} sqft)

AUDIENCES:
${audiences.map((a: any) => `- ${a.name}: ${a.description ?? ""} (${a.priority ?? "—"})`).join("\n") || "—"}

BUDGET: ${
    budget.perShow
      ? `$${Number(budget.perShow).toLocaleString()} per show`
      : budget.range
        ? `$${budget.range.min?.toLocaleString?.() ?? budget.range.min} – $${budget.range.max?.toLocaleString?.() ?? budget.range.max}`
        : "TBD"
  }

# Strategic elements (from /generate)

BIG IDEA:
${els.bigIdea?.data ? `${els.bigIdea.data.headline ?? ""}\n${els.bigIdea.data.subheadline ?? ""}\n${els.bigIdea.data.narrative ?? ""}\nStrategic position: ${els.bigIdea.data.strategicPosition ?? "—"}\nDifferentiation: ${els.bigIdea.data.differentiation ?? "—"}` : "—"}

EXPERIENCE FRAMEWORK:
${els.experienceFramework?.data ? `${els.experienceFramework.data.conceptDescription ?? ""}\nDesign Principles: ${(els.experienceFramework.data.designPrinciples ?? []).map((p: any) => (typeof p === "string" ? p : `${p.name}: ${p.description ?? ""}`)).join("; ") || "—"}` : "—"}

INTERACTIVE MECHANICS:
${els.interactiveMechanics?.data ? `Hero: ${els.interactiveMechanics.data.hero?.name ?? "—"} — ${els.interactiveMechanics.data.hero?.concept ?? "—"}\nSecondary: ${(els.interactiveMechanics.data.secondary ?? []).map((s: any) => s.name).join(", ") || "—"}` : "—"}

DIGITAL STORYTELLING:
${els.digitalStorytelling?.data ? `${els.digitalStorytelling.data.philosophy ?? "—"}` : "—"}

SPATIAL STRATEGY:
${els.spatialStrategy?.data ? `Zones: ${(els.spatialStrategy.data.configs?.[0]?.zones ?? []).map((z: any) => `${z.name}: ${z.sqft} sqft (${z.percentage ?? "?"}%)`).join(", ") || "—"}\nMaterials: ${(els.spatialStrategy.data.materialsAndMood ?? []).map((m: any) => `${m.material ?? m.name ?? ""}${m.feel ? ` — ${m.feel}` : ""}`).join("; ") || "—"}` : "—"}

BUDGET LOGIC:
${els.budgetLogic?.data ? `Total: $${Number(els.budgetLogic.data.totalPerShow ?? 0).toLocaleString()}\nAllocation: ${(els.budgetLogic.data.allocation ?? []).map((a: any) => `${a.category}: ${a.percentage}% ($${Number(a.amount ?? 0).toLocaleString()})`).join(", ") || "—"}` : "—"}

# Deck identity

AGENCY: ${body.agencyName ?? "—"}
PRIMARY BRAND COLOR FOR THIS DECK: ${body.brandColor ?? brand.visualIdentity?.colors?.[0] ?? "#0F0F0F"}
SECONDARY COLOR: ${body.secondaryColor ?? "#FAFAF7"}
STYLE PRESET: ${body.stylePreset ?? "Pitch"}

# Available render images
${imageBlock || "(none — design slides without imagery if needed)"}

${overridesBlock ? `# User edits to honor (do NOT contradict)\n${overridesBlock}\n` : ""}

# Your task

Design a 12–14 slide pitch deck for this project. Each slide MUST follow the design principles in your system prompt — typography-first, brand color carrying weight, varied layouts, intentional whitespace, big numbers featured at scale.

Return slides via the create_designed_deck tool. Each slide is a complete HTML document. Each slide MUST start with <!DOCTYPE html> and end with </html>.`;
}

function buildDesignedDeckRegenerateMessage(body: any): string {
  const target = body.regenerateSlideIds ?? [];
  const existing = body.existingSlides ?? [];
  const targetSlides = existing.filter((s: any) => target.includes(s.id));
  const nonTargetContext = existing
    .filter((s: any) => !target.includes(s.id))
    .map((s: any) => `- ${s.id} (${s.slideType}): ${s.title}`)
    .join("\n");

  return `${buildDesignedDeckUserMessage(body)}

# REGENERATION REQUEST

The user has asked you to regenerate ONLY these slides:
${targetSlides.map((s: any) => `--- existing slide ${s.id} (${s.slideType}, "${s.title}") ---\n${s.html.slice(0, 1500)}\n--- end ---`).join("\n\n")}

The other slides in the deck (which you should NOT return) are:
${nonTargetContext || "(none)"}

Generate fresh HTML for the requested slides only. Use a meaningfully different visual approach — different layout, different typographic emphasis, different use of brand color. Make it better.`;
}

async function handleDesignedDeck(body: any): Promise<Response> {
  const isRegenerate = (body.regenerateSlideIds?.length ?? 0) > 0;

  let ragFormatted = "";
  if (!isRegenerate && body.agency_id) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ragQuery = [
      `Pitch deck for ${body.projectName ?? body.parsedBrief?.brand?.name ?? ""}`,
      body.parsedBrief?.brand?.name,
      body.parsedBrief?.brand?.category,
      body.parsedBrief?.objectives?.primary,
      body.elements?.bigIdea?.data?.headline,
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 4000);
    try {
      const ragContext = await buildRagContext(supabase, {
        query: ragQuery,
        agencyId: body.agency_id,
        clientId: body.client_id,
        activationTypeId: body.activation_type_id,
        projectId: body.project_id,
      });
      if (ragContext.formatted) ragFormatted = ragContext.formatted;
    } catch (e) {
      console.warn("[generate-presentation:designed-deck] RAG retrieval failed:", e);
    }
  }

  const finalSystem = ragFormatted
    ? `${DESIGNED_DECK_SYSTEM_PROMPT}\n\n${ragFormatted}`
    : DESIGNED_DECK_SYSTEM_PROMPT;
  const userMessage = isRegenerate
    ? buildDesignedDeckRegenerateMessage(body)
    : buildDesignedDeckUserMessage(body);

  const aiResult = await callAnthropic({
    system: finalSystem,
    messages: [{ role: "user", content: userMessage }],
    tools: [DESIGNED_DECK_TOOL],
    toolChoice: { type: "tool", name: "create_designed_deck" },
    maxTokens: 16384,
    temperature: 0.7,
  });

  const out = aiResult.toolCalls?.[0]?.arguments ?? null;
  const slides = out?.slides;

  if (!Array.isArray(slides) || slides.length === 0) {
    console.error(
      "[generate-presentation:designed-deck] no slides returned. tool calls:",
      JSON.stringify(aiResult.toolCalls).slice(0, 500),
    );
    return new Response(
      JSON.stringify({
        error: "Claude didn't return any slides — try again or simplify the input.",
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const cleaned = (slides as any[])
    .filter((s) => typeof s?.html === "string" && s.html.includes("<html"))
    .map((s) => ({
      id: String(s.id ?? `slide-${Math.random().toString(36).slice(2, 8)}`),
      title: String(s.title ?? "Untitled"),
      slideType: String(s.slideType ?? "custom"),
      html: String(s.html),
      usedImageAngles: Array.isArray(s.usedImageAngles) ? s.usedImageAngles : [],
    }));

  if (cleaned.length === 0) {
    return new Response(
      JSON.stringify({ error: "Claude returned malformed slides. Try again." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ slides: cleaned }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Slides (legacy) handler ───────────────────────────────────────────────

async function handleSlides(body: any): Promise<Response> {
  const {
    parsedBrief,
    elements,
    projectName,
    imageUrls,
    agency_id,
    client_id,
    activation_type_id,
    project_id,
  } = body;

  if (!parsedBrief || typeof parsedBrief !== "object") {
    return new Response(JSON.stringify({ error: "parsedBrief is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!elements || typeof elements !== "object") {
    return new Response(JSON.stringify({ error: "elements is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const brand = parsedBrief?.brand || {};
  const objectives = parsedBrief?.objectives || {};
  const spatial = parsedBrief?.spatial || {};
  const budget = parsedBrief?.budget || {};
  const audiences = parsedBrief?.audiences || [];

  const dataSummary = `
PROJECT: ${projectName || brand.name || "Untitled Project"}
BRAND: ${brand.name} — ${brand.category}
BRAND POV: ${brand.pov}
BRAND PERSONALITY: ${(brand.personality || []).join(", ")}
COLORS: ${(brand.visualIdentity?.colors || []).join(", ")}

PRIMARY OBJECTIVE: ${objectives.primary}
SECONDARY OBJECTIVES: ${(objectives.secondary || []).join("; ")}
DIFFERENTIATION: ${(objectives.differentiationGoals || []).join("; ")}

EVENTS: ${(parsedBrief?.events?.shows || []).map((s: any) => `${s.name} (${s.location})`).join(", ")}
BOOTH SIZE: ${spatial.footprints?.[0]?.size || "TBD"} (${spatial.footprints?.[0]?.sqft || "TBD"} sqft)

TARGET AUDIENCES:
${audiences.map((a: any) => `- ${a.name}: ${a.description} (Priority: ${a.priority})`).join("\n")}

BUDGET: ${budget.perShow ? `$${budget.perShow.toLocaleString()} per show` : budget.range ? `$${budget.range.min.toLocaleString()} - $${budget.range.max.toLocaleString()}` : "TBD"}

--- STRATEGIC ELEMENTS ---

BIG IDEA: ${elements.bigIdea?.data ? `${elements.bigIdea.data.headline} — ${elements.bigIdea.data.subheadline}\n${elements.bigIdea.data.narrative}\nStrategic Position: ${elements.bigIdea.data.strategicPosition}\nDifferentiation: ${elements.bigIdea.data.differentiation}` : "Not generated"}

EXPERIENCE FRAMEWORK: ${elements.experienceFramework?.data ? `${elements.experienceFramework.data.conceptDescription}\nDesign Principles: ${(elements.experienceFramework.data.designPrinciples || []).map((p: any) => `${p.name}: ${p.description}`).join("; ")}\nVisitor Journey: ${(elements.experienceFramework.data.visitorJourney || []).map((s: any) => `${s.stage}: ${s.description}`).join(" → ")}` : "Not generated"}

INTERACTIVE MECHANICS: ${elements.interactiveMechanics?.data ? `Hero: ${elements.interactiveMechanics.data.hero?.name} — ${elements.interactiveMechanics.data.hero?.concept}\nPhysical Form: ${elements.interactiveMechanics.data.hero?.physicalForm?.structure}\nSecondary: ${(elements.interactiveMechanics.data.secondary || []).map((s: any) => s.name).join(", ")}` : "Not generated"}

DIGITAL STORYTELLING: ${elements.digitalStorytelling?.data ? `Philosophy: ${elements.digitalStorytelling.data.philosophy}\nTracks: ${(elements.digitalStorytelling.data.audienceTracks || []).map((t: any) => `${t.trackName} (${t.targetAudience})`).join(", ")}` : "Not generated"}

HUMAN CONNECTION: ${elements.humanConnection?.data ? `Zones: ${(elements.humanConnection.data.configs?.[0]?.zones || []).map((z: any) => `${z.name} (${z.capacity}): ${z.description}`).join("; ")}` : "Not generated"}

ADJACENT ACTIVATIONS: ${elements.adjacentActivations?.data ? `${(elements.adjacentActivations.data.activations || []).map((a: any) => `${a.name} (${a.type}): ${a.format}`).join("; ")}` : "Not generated"}

SPATIAL STRATEGY: ${elements.spatialStrategy?.data ? `Zones: ${(elements.spatialStrategy.data.configs?.[0]?.zones || []).map((z: any) => `${z.name}: ${z.sqft}sqft (${z.percentage}%)`).join(", ")}\nMaterials: ${(elements.spatialStrategy.data.materialsAndMood || []).map((m: any) => `${m.material}: ${m.use}`).join("; ")}` : "Not generated"}

BUDGET LOGIC: ${elements.budgetLogic?.data ? `Total: $${elements.budgetLogic.data.totalPerShow?.toLocaleString()}\nAllocation: ${(elements.budgetLogic.data.allocation || []).map((a: any) => `${a.category}: ${a.percentage}% ($${a.amount?.toLocaleString()})`).join(", ")}\nRisk Factors: ${(elements.budgetLogic.data.riskFactors || []).map((r: any) => `${r.factor} (${r.level})`).join(", ")}` : "Not generated"}

AVAILABLE RENDER IMAGES: ${(imageUrls || []).map((i: any) => i.angle).join(", ")}
`;

  const systemPrompt = `You are a senior presentation strategist for trade show, exhibit, and experiential proposals. Your decks win business — they're persuasive, on-brand, and immediately presentable without cleanup.

OUTPUT: Use the create_presentation tool. Produce 12–16 slides total.

PER-SLIDE FIELDS:
- title: 4–9 words. Strategic, not generic. Avoid "Overview", "Introduction", "Conclusion" as a single word.
- subtitle: One supporting line, ≤ 12 words. No restating the title.
- bodyPoints: 3–5 bullets. EACH bullet ≤ 14 words. Concrete and specific — name actual zones, mechanics, numbers, brand attributes from the project data, not generic platitudes.
- speakerNotes: 2–3 sentences. What the presenter says out loud — narrative, not a bullet recap.
- slideType: One of "title", "section", "content", "twoColumn", "imageFeature", "data", "closing"
- imageAngle: When slideType is "imageFeature" set this to a real angle id from AVAILABLE RENDER IMAGES (e.g. "hero_34", "front", "left"). Omit if no matching render exists.

VOICE:
- Match the brand's tone (read BRAND POV + BRAND PERSONALITY in the data).
- Active voice. Short clauses. No filler ("really", "very", "various", "innovative" — earn the word or cut it).
- No marketing clichés ("game-changer", "world-class", "best-in-class", "leverage", "unlock", "redefine"). Be specific instead.
- No placeholder text ever ("[client]", "TBD", "Lorem ipsum"). If a value is missing in the data, work around it.

VISUAL DENSITY:
- Image-feature slides: keep text minimal (title + subtitle + ≤ 2 bullets).
- Content/data slides: bullets only — no paragraphs.
- Always leave headroom; don't force 5 bullets when 3 are sharper.

QUALITY BAR:
- A senior creative director should be able to present this deck cold without rewriting.`;

  let ragContext: { formatted: string; chunks: any[]; byScope?: any } = {
    formatted: "",
    chunks: [],
  };
  if (agency_id) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const ragQuery = [
      `Pitch deck for ${projectName || brand.name || "project"}`,
      brand.name,
      brand.category,
      objectives.primary,
      elements.bigIdea?.data?.headline,
      elements.bigIdea?.data?.subheadline,
    ]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 4000);
    try {
      ragContext = await buildRagContext(supabase, {
        query: ragQuery,
        agencyId: agency_id,
        clientId: client_id,
        activationTypeId: activation_type_id,
        projectId: project_id,
      });
    } catch (e) {
      console.warn("[generate-presentation:slides] RAG retrieval failed:", e);
    }
  }

  const finalSystemPrompt = ragContext.formatted
    ? `${systemPrompt}\n\n${ragContext.formatted}`
    : systemPrompt;

  const aiResult = await callAnthropic({
    system: finalSystemPrompt,
    messages: [
      { role: "user", content: `Create a presentation deck for this project:\n\n${dataSummary}` },
    ],
    tools: [
      {
        name: "create_presentation",
        description: "Create a structured presentation deck",
        input_schema: {
          type: "object",
          properties: {
            slides: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  subtitle: { type: "string" },
                  bodyPoints: { type: "array", items: { type: "string" } },
                  speakerNotes: { type: "string" },
                  slideType: {
                    type: "string",
                    enum: [
                      "title",
                      "section",
                      "content",
                      "twoColumn",
                      "imageFeature",
                      "data",
                      "closing",
                    ],
                  },
                  imageAngle: { type: "string" },
                },
                required: ["title", "subtitle", "bodyPoints", "speakerNotes", "slideType"],
              },
            },
          },
          required: ["slides"],
        },
      },
    ],
    toolChoice: { type: "tool", name: "create_presentation" },
    maxTokens: 8192,
  });

  const presentation = aiResult.toolCalls?.[0]?.arguments ?? null;
  const slides = presentation?.slides;

  if (!slides || !Array.isArray(slides) || slides.length === 0) {
    console.error(
      "Failed to extract slides from Anthropic response. Text:",
      aiResult.text?.substring(0, 500),
    );
    throw new Error("Could not parse AI response into slides");
  }

  return new Response(JSON.stringify({ slides }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── HTTP entry point ──────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // GET ?ping=1 — short-circuit before reading body.
  // Add ?validate=1 for a deep check that calls Anthropic with the key.
  const url = new URL(req.url);
  if (url.searchParams.get("ping") === "1") {
    return await pingResponse({ validateKey: url.searchParams.get("validate") === "1" });
  }

  try {
    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: "Request body is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Request body is not valid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body?.ping === true) {
      return await pingResponse({ validateKey: body?.validateKey === true });
    }

    const mode = body?.mode ?? "slides";
    if (mode === "designed-deck") return await handleDesignedDeck(body);
    return await handleSlides(body);
  } catch (e) {
    console.error("[generate-presentation] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
