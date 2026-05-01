// generate-designed-deck — AI-designed presentation slides as HTML.
//
// Why this exists: pptxgenjs produces mechanical layouts (boxes, bullets,
// tables — flat). For pitch-quality decks the customer actually sends to a
// brand like Red Bull, we need real design — typography hierarchy,
// asymmetric grids, intentional whitespace, brand color used as a primary
// element rather than an accent. Claude can produce that as HTML+CSS;
// pptxgenjs cannot.
//
// Flow:
//   1. Caller passes parsedBrief + elements + render image URLs + brand
//      config + (optionally) deck overrides + style preset.
//   2. Claude returns N self-contained HTML slides — each is a single
//      <html> document with inline <style>, sized to 1920x1080 (16:9).
//   3. The client renders them in sandboxed iframes for preview, lets
//      the user regenerate any individual slide, and exports the deck
//      via html2canvas + jsPDF / pptxgenjs (image per slide).
//
// Slide format contract returned to the client:
//   { slides: Array<{ id: string; title: string; slideType: string;
//                     html: string; usedImageAngles?: string[] }> }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";
import { buildRagContext } from "../_shared/rag-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RequestBody {
  parsedBrief: any;
  elements: any;
  projectName?: string;
  imageUrls?: Array<{ angle: string; url: string }>;
  /** Brand color for the deck (hex, with or without #). Pulled from agency profile. */
  brandColor?: string;
  /** Secondary color, optional. */
  secondaryColor?: string;
  /** Agency name for footer / sign-off. */
  agencyName?: string;
  /** Agency contact info, optional. */
  agencyContact?: { name?: string; email?: string; phone?: string };
  /** Style preset name — e.g. "Pitch", "Executive", "Tactical". Influences voice + density. */
  stylePreset?: string;
  /** Existing slide HTMLs to regenerate (keyed by slide id). When set, only those slides come back. */
  regenerateSlideIds?: string[];
  /** Existing slides for context when regenerating individual slides. */
  existingSlides?: Array<{ id: string; title: string; slideType: string; html: string }>;
  /** Per-project deck overrides (titles, narrative tweaks) for Claude to honor. */
  deckOverrides?: Record<string, { title?: string; narrative?: string; bullets?: string[] }>;
  // RAG scope ids — optional but heavily improve grounding.
  agency_id?: string;
  client_id?: string;
  activation_type_id?: string;
  project_id?: string;
}

// ── System prompt ───────────────────────────────────────────────────────────
//
// This is the most important code in this file. Every word here is load-
// bearing — it's what separates "Claude wrote some HTML" from "Claude
// designed a deck a senior creative director would actually send."

const SYSTEM_PROMPT = `You are a senior brand designer at a top creative agency. You design high-end pitch decks for clients like Red Bull, Nike, Apple, Patagonia. Your decks WIN business because they look like work the brand themselves would publish, not like generic templates.

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

// ─── Build user message ────────────────────────────────────────────────────

function buildUserMessage(body: RequestBody): string {
  const brand = body.parsedBrief?.brand ?? {};
  const objectives = body.parsedBrief?.objectives ?? {};
  const spatial = body.parsedBrief?.spatial ?? {};
  const budget = body.parsedBrief?.budget ?? {};
  const audiences = body.parsedBrief?.audiences ?? [];
  const els = body.elements ?? {};

  const imageBlock = (body.imageUrls ?? [])
    .map((i) => `- ${i.angle}: ${i.url}`)
    .join("\n");

  const overridesBlock = body.deckOverrides
    ? Object.entries(body.deckOverrides)
        .map(([id, ovr]) => {
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
${
    els.bigIdea?.data
      ? `${els.bigIdea.data.headline ?? ""}\n${els.bigIdea.data.subheadline ?? ""}\n${els.bigIdea.data.narrative ?? ""}\nStrategic position: ${els.bigIdea.data.strategicPosition ?? "—"}\nDifferentiation: ${els.bigIdea.data.differentiation ?? "—"}`
      : "—"
  }

EXPERIENCE FRAMEWORK:
${
    els.experienceFramework?.data
      ? `${els.experienceFramework.data.conceptDescription ?? ""}\nDesign Principles: ${(els.experienceFramework.data.designPrinciples ?? []).map((p: any) => (typeof p === "string" ? p : `${p.name}: ${p.description ?? ""}`)).join("; ") || "—"}\nVisitor Journey: ${(els.experienceFramework.data.visitorJourney ?? []).map((s: any) => (typeof s === "string" ? s : `${s.stage}: ${s.description ?? ""}`)).join(" → ") || "—"}`
      : "—"
  }

INTERACTIVE MECHANICS:
${
    els.interactiveMechanics?.data
      ? `Hero: ${els.interactiveMechanics.data.hero?.name ?? "—"} — ${els.interactiveMechanics.data.hero?.concept ?? "—"}\nSecondary: ${(els.interactiveMechanics.data.secondary ?? []).map((s: any) => s.name).join(", ") || "—"}`
      : "—"
  }

DIGITAL STORYTELLING:
${
    els.digitalStorytelling?.data
      ? `${els.digitalStorytelling.data.philosophy ?? "—"}\nTracks: ${(els.digitalStorytelling.data.audienceTracks ?? []).map((t: any) => `${t.trackName} (${t.targetAudience})`).join(", ") || "—"}`
      : "—"
  }

SPATIAL STRATEGY:
${
    els.spatialStrategy?.data
      ? `Zones: ${(els.spatialStrategy.data.configs?.[0]?.zones ?? []).map((z: any) => `${z.name}: ${z.sqft} sqft (${z.percentage ?? "?"}%)`).join(", ") || "—"}\nMaterials: ${(els.spatialStrategy.data.materialsAndMood ?? []).map((m: any) => `${m.material ?? m.name ?? ""}${m.feel ? ` — ${m.feel}` : ""}`).join("; ") || "—"}`
      : "—"
  }

BUDGET LOGIC:
${
    els.budgetLogic?.data
      ? `Total: $${Number(els.budgetLogic.data.totalPerShow ?? 0).toLocaleString()}\nAllocation: ${(els.budgetLogic.data.allocation ?? []).map((a: any) => `${a.category}: ${a.percentage}% ($${Number(a.amount ?? 0).toLocaleString()})`).join(", ") || "—"}`
      : "—"
  }

# Deck identity

AGENCY: ${body.agencyName ?? "—"}
PRIMARY BRAND COLOR FOR THIS DECK: ${body.brandColor ?? brand.visualIdentity?.colors?.[0] ?? "#0F0F0F"}
SECONDARY COLOR: ${body.secondaryColor ?? "#FAFAF7"}
STYLE PRESET: ${body.stylePreset ?? "Pitch"}

# Available render images
${imageBlock || "(none — design slides without imagery if needed, or mention TBD placeholders sparingly)"}

${overridesBlock ? `# User edits to honor (do NOT contradict)\n${overridesBlock}\n` : ""}

# Your task

Design a 12–14 slide pitch deck for this project. Each slide MUST follow the design principles in your system prompt — typography-first, brand color carrying weight, varied layouts, intentional whitespace, big numbers featured at scale.

Return slides via the create_designed_deck tool. Each slide is a complete HTML document. Each slide MUST start with <!DOCTYPE html> and end with </html>.`;
}

// ─── Single regenerate user message ────────────────────────────────────────

function buildRegenerateMessage(body: RequestBody): string {
  const target = body.regenerateSlideIds ?? [];
  const existing = body.existingSlides ?? [];

  const targetSlides = existing.filter((s) => target.includes(s.id));
  const nonTargetContext = existing
    .filter((s) => !target.includes(s.id))
    .map((s) => `- ${s.id} (${s.slideType}): ${s.title}`)
    .join("\n");

  return `${buildUserMessage(body)}

# REGENERATION REQUEST

The user has asked you to regenerate ONLY these slides:
${targetSlides.map((s) => `--- existing slide ${s.id} (${s.slideType}, "${s.title}") ---\n${s.html.slice(0, 1500)}\n--- end ---`).join("\n\n")}

The other slides in the deck (which you should NOT return) are:
${nonTargetContext || "(none)"}

Generate fresh HTML for the requested slides only. Use a meaningfully different visual approach than what's there now — different layout, different typographic emphasis, different use of brand color. Make it better.`;
}

// ─── Tool schema ────────────────────────────────────────────────────────────

const TOOL = {
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
            id: {
              type: "string",
              description:
                "Stable id (e.g. 'cover', 'big-idea', 'spatial-1'). Used by the client to track regenerations.",
            },
            title: {
              type: "string",
              description:
                "Short slide title — used in the editor's slide list. NOT necessarily what the slide says.",
            },
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
            html: {
              type: "string",
              description:
                "Complete HTML document, <!DOCTYPE html> through </html>. Body 1920x1080 px exactly.",
            },
            usedImageAngles: {
              type: "array",
              items: { type: "string" },
              description: "Angle ids of any render images used on this slide.",
            },
          },
          required: ["id", "title", "slideType", "html"],
        },
      },
    },
    required: ["slides"],
  },
};

// ─── HTTP handler ──────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Lightweight deployment check — used by the client's "Test connection"
  // button to verify the function is reachable without spending tokens.
  // Triggered by GET ?ping=1 OR a POST body with { ping: true }.
  const url = new URL(req.url);
  if (url.searchParams.get("ping") === "1") {
    const hasAnthropicKey = !!Deno.env.get("ANTHROPIC_API_KEY");
    return new Response(
      JSON.stringify({
        ok: true,
        function: "generate-designed-deck",
        anthropicKey: hasAnthropicKey ? "configured" : "missing",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const rawBody = await req.text();
    if (!rawBody) {
      return new Response(JSON.stringify({ error: "Request body is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let body: RequestBody;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "Request body is not valid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Quick ping in POST body too.
    if ((body as any)?.ping === true) {
      const hasAnthropicKey = !!Deno.env.get("ANTHROPIC_API_KEY");
      return new Response(
        JSON.stringify({
          ok: true,
          function: "generate-designed-deck",
          anthropicKey: hasAnthropicKey ? "configured" : "missing",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!body.parsedBrief || typeof body.parsedBrief !== "object") {
      return new Response(JSON.stringify({ error: "parsedBrief is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.elements || typeof body.elements !== "object") {
      return new Response(JSON.stringify({ error: "elements is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isRegenerate = (body.regenerateSlideIds?.length ?? 0) > 0;

    // RAG context — only on full-deck generation; regenerations re-use the
    // existing context already baked into the existing slide content.
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
        console.warn("[generate-designed-deck] RAG retrieval failed (non-fatal):", e);
      }
    }

    const finalSystem = ragFormatted ? `${SYSTEM_PROMPT}\n\n${ragFormatted}` : SYSTEM_PROMPT;
    const userMessage = isRegenerate ? buildRegenerateMessage(body) : buildUserMessage(body);

    const aiResult = await callAnthropic({
      system: finalSystem,
      messages: [{ role: "user", content: userMessage }],
      tools: [TOOL],
      toolChoice: { type: "tool", name: "create_designed_deck" },
      // 14 slides × ~6KB each = ~85KB output. 16k tokens covers comfortably.
      maxTokens: 16384,
      // A little creative variance is welcome — Claude tends to play it safe
      // at 0; 0.7 lets it explore layout choices.
      temperature: 0.7,
    });

    const out = aiResult.toolCalls?.[0]?.arguments ?? null;
    const slides = out?.slides;

    if (!Array.isArray(slides) || slides.length === 0) {
      console.error(
        "[generate-designed-deck] no slides returned. tool calls:",
        JSON.stringify(aiResult.toolCalls).slice(0, 500),
      );
      return new Response(
        JSON.stringify({
          error: "Claude didn't return any slides — try again or simplify the input.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Defensive: ensure each slide has an html that begins with <!DOCTYPE.
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
  } catch (e) {
    console.error("[generate-designed-deck] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
