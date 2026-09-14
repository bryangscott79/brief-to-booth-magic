// plan-concepts — the chat director for the post-brief PLANNING CANVAS.
//
// The Planning step is a conversation: the user talks to a creative
// director about what the booth could be, and every turn can produce one
// or more CONCEPTS — each a complete, ready-to-render image prompt in the
// same section grammar the deterministic composer uses
// (src/lib/normalizedBrief.ts: # SCENE / # SPACE / # BRAND / # ENVIRONMENT
// / # BUDGET REALITY / # HARD CONSTRAINTS / # NEGATIVE).
//
// This function never renders anything. It returns prompts; the client
// fans them out to generate-hero (one call per concept) and stores the
// resulting images as board cards. That split keeps the director cheap
// and the image calls independently retryable.
//
// Request  { brief: ParsedBrief JSON, history?: Array<{role, content}>,
//            message: string,
//            existingCards?: Array<{ id, label, prompt }>,
//            boothSizeLabel?: string,
//            agency_id?, client_id?, activation_type_id?, project_id? }
// Response { reply: string,
//            concepts: Array<{ label, prompt, rationale }>,
//            fn_version: 1 }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";
import { buildUsageContext } from "../_shared/usage-context.ts";
import { buildRagContext, knowledgeSummary } from "../_shared/rag-helper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FN_VERSION = 2;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ ...(body as Record<string, unknown>), fn_version: FN_VERSION }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Deliberately a PLAIN tool, not strict: the strict subset rejects
 *  descriptive schema keywords (minItems/maxItems/etc.) and demands every
 *  property be required. The handler validates the shape instead. */
const PLAN_TOOL = {
  name: "plan_visuals",
  description:
    "Reply to the user in the planning conversation and, when a visual would help, emit one or more complete image prompts to render as concept cards.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "concepts"],
    properties: {
      reply: {
        type: "string",
        description:
          "What you say back to the user — plain sentences, no markdown, no bullet lists. Name what you are about to render and why it answers their ask. If you are emitting no concepts (they asked a question, or you need one fact first), say so here and ask for exactly what you need.",
      },
      concepts: {
        type: "array",
        description:
          "The visuals to render this turn. Empty when the turn is conversational. One concept for a focused ask; 2-4 when the user asks to explore or compare directions.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "prompt", "rationale"],
          properties: {
            label: {
              type: "string",
              description:
                "Short board title for the card — 2 to 5 words, title case, describing the direction (e.g. 'Suspended Light Canopy'). Never 'Concept 1'.",
            },
            rationale: {
              type: "string",
              description:
                "One sentence tying this direction back to a fact in the brief (an objective, an audience, the budget tier, the footprint).",
            },
            prompt: {
              type: "string",
              description:
                "A COMPLETE image prompt in the # SECTION grammar described in the system prompt. Self-contained — the renderer sees nothing else.",
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You are a creative director at an experiential design agency, planning the visuals for a trade-show / brand-activation build with an account team. You are in a working conversation: they think out loud, you answer, and when a picture would move the conversation forward you emit image prompts that the app renders into concept cards on a board.

WHAT YOU EMIT
Each concept's \`prompt\` is a COMPLETE, self-contained image prompt written in this section grammar (the same grammar the app's deterministic composer uses — mirror it exactly, sections separated by a blank line, each header on its own line):

# SCENE
One paragraph: "A 16:9 photorealistic 3/4 perspective render of <what this is>, photographed at eye level (1.7m / 5'8") from the front-left at 45°." Then the photographic register — editorial architectural photography, confident, premium, photoreal.

# SPACE
Bullet lines for the constraints the design works WITHIN, never a layout blueprint: floor footprint (a RECTANGULAR carpet/platform allocation — the base outline is always a rectangle), maximum structure height, number of open sides, human scale, minimum circulation. Close with: above the floor, design organically — walls, fascia, ceilings and hero installations express the brand's structural language freely; the floor/carpet outline stays rectangular regardless.

# STRUCTURAL APPROACH
(Optional, but this is where a concept actually differentiates.) The booth's architecture — canopy shape, fascia geometry, column form, surface curvature. The brand's visual language expressed AS structure, not as surface decoration. Name explicitly what this is NOT: a rectangular pavilion with flat horizontal fascia, repeated identical bay modules, a standard trade-show truss top.

# ZONE PROGRAM
What the booth needs to CONTAIN, by function (reception, hero focal area, demo, meeting, lounge, storage) — not where things go. Let the render place them.

# BRAND
Brand name and descriptor, then the colors by role (primary / secondary / accent) with hex where the brief gives one, then any required signage as quoted literal copy.

# BUDGET REALITY
The budget tier and its material vocabulary — standard: laminate surfaces, fabric graphics, vinyl, stock aluminum extrusion, functional lighting. premium: custom millwork, backlit SEG fabric, wood veneer, metal trim, integrated AV, designed lighting. ultra: sculptural forms, kinetic elements, natural stone, LED-integrated panels, theatrical lighting. State the design stays in tier, with at most ONE accent moment hinting one tier above.

# CONTEXT
Audience, time of day, staffing, any interactive technology the brief names.

# ENVIRONMENT
MANDATORY on every concept. The build is always staged in a real place — a working convention hall (venue floor visible, 10 ft aisles, adjacent booths softly out of focus, attendees at human scale, hall lighting) or the activation's real outdoor/architectural setting. The structure occupies roughly 60-70% of the frame width; the surrounding environment is always visible around and behind it. Never a blank background, white void, studio backdrop, or floating booth.

# HARD CONSTRAINTS (output MUST satisfy)
Footprint exactly as given, open sides unobstructed and visible, required signage visible, hero installation no more than ~40% of the footprint.

# NEGATIVE
no overlaid annotations, no zone names or room labels on fascia, no dimension callouts or percentage labels, no flat horizontal rectangular fascia / generic trade-show truss, no cartoon, no over-saturation, no obvious AI artifacts, blank background, white void, studio backdrop, isolated product shot, floating booth with no floor — plus anything the brief says to avoid.

RULES
- Stay inside the brief's facts. Brand, objectives, audience, budget tier, footprint, show and venue come from the brief. NEVER invent dimensions, square footage, budgets, dates, client claims, or a venue the brief does not name. If a fact you need is missing, omit that line — do not guess a number. If the ask is impossible without a missing fact, return zero concepts and ask for it in \`reply\`.
- Concepts differ in ARCHITECTURE and IDEA, not in adjectives. Two concepts that describe the same structure with different mood words are one concept.
- Count: exactly 1 concept when the user names one thing to see or asks to refine a specific card; 2-4 when they ask to explore, compare, or "show me options". Zero when they asked a question, are reacting, or are deciding.
- Refinement: when the user is reacting to an existing card (the card's prompt is given to you), start from that prompt and change only what they asked for — everything else stays word for word. The result is a NEW card; the original is never replaced.
- Labels are board titles a designer would write on a pin-up, never "Option A" or "Concept 1".
- \`reply\` is short, specific, and conversational — two or three sentences at most. No markdown, no headers, no bullet lists.`;

interface ExistingCard {
  id?: unknown;
  label?: unknown;
  prompt?: unknown;
}

interface RawConcept {
  label?: unknown;
  prompt?: unknown;
  rationale?: unknown;
}

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** The model occasionally emits a prompt with no # header at all (prose).
 *  Those render badly and are impossible to refine, so drop them. */
const isUsablePrompt = (prompt: string): boolean =>
  prompt.length >= 80 && /^#\s+\w/m.test(prompt);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "invalid JSON body" }, 400);

    const message = str((body as Record<string, unknown>).message, 4_000);
    if (!message) return json({ error: "message required" }, 400);

    const briefJson = (body as Record<string, unknown>).brief ?? null;
    const briefText = briefJson
      ? JSON.stringify(briefJson, null, 2).slice(0, 24_000)
      : "(no parsed brief yet — ask for what you need before proposing visuals)";

    const boothSizeLabel = str((body as Record<string, unknown>).boothSizeLabel, 80);

    const historyRaw = (body as Record<string, unknown>).history;
    const history: Array<{ role: string; content: string }> = Array.isArray(historyRaw)
      ? historyRaw
          .slice(-10)
          .map((h) => {
            const turn = h as { role?: unknown; content?: unknown };
            return {
              role: turn.role === "assistant" ? "assistant" : "user",
              content: str(turn.content, 2_000),
            };
          })
          .filter((h) => h.content.length > 0)
      : [];

    const cardsRaw = (body as Record<string, unknown>).existingCards;
    const existingCards: ExistingCard[] = Array.isArray(cardsRaw) ? cardsRaw.slice(-12) : [];
    const cardsText = existingCards.length
      ? existingCards
          .map((c, i) => {
            const label = str(c.label, 120) || `Card ${i + 1}`;
            const id = str(c.id, 64);
            const prompt = str(c.prompt, 4_000);
            return `--- CARD ${i + 1}${id ? ` (id ${id})` : ""}: ${label}\n${prompt}`;
          })
          .join("\n\n")
          .slice(0, 20_000)
      : "(the board is empty)";

    // Planning is where the direction is chosen, so it is the step that most
    // benefits from the agency's own past work — what they have built, what
    // this client has approved before, what this activation type demands.
    // Retrieval is best-effort and never blocks the turn.
    const scope = body as Record<string, unknown>;
    const ragContext = await buildRagContext(userClient, {
      query: `${message}\n\n${briefText.slice(0, 2_000)}`,
      agencyId: str(scope.agency_id, 64),
      clientId: str(scope.client_id, 64) || null,
      activationTypeId: str(scope.activation_type_id, 64) || null,
      projectId: str(scope.project_id, 64) || null,
      topK: 6,
      source: "plan-concepts",
      userId: user.id,
    });

    const userTurn = [
      "PARSED BRIEF (the only source of facts):",
      briefText,
      "",
      boothSizeLabel ? `ACTIVE FOOTPRINT: ${boothSizeLabel}` : "",
      "",
      // Knowledge is craft, not fact: it informs HOW to build, while the
      // brief stays the only source of WHAT is being built.
      ragContext.formatted
        ? `${ragContext.formatted}\n\nThe retrieved context above is the agency's own knowledge — house standards, past builds, fabrication limits. Let it shape HOW you design. It never overrides the brief on facts (footprint, budget, dates, deliverables).`
        : "",
      "",
      "CONCEPTS ALREADY ON THE BOARD:",
      cardsText,
      "",
      "THE TEAM SAYS:",
      message,
    ]
      .filter((s) => s !== "")
      .join("\n");

    // No temperature — the 5-family (default claude-opus-5) rejects
    // sampling params with a 400.
    const result = await callAnthropic({
      usage: await buildUsageContext(req, "plan-concepts").catch(() => undefined),
      system: SYSTEM,
      messages: [...history, { role: "user", content: userTurn }],
      tools: [PLAN_TOOL],
      toolChoice: { type: "tool", name: "plan_visuals" },
      maxTokens: 8192,
    });

    const call = result.toolCalls?.find((c) => c.name === "plan_visuals");
    if (!call) {
      return json(
        { error: "The planner returned no plan", reply: result.text ?? "", concepts: [] },
        502,
      );
    }

    const args = (call.arguments ?? {}) as { reply?: unknown; concepts?: unknown };
    const rawConcepts: RawConcept[] = Array.isArray(args.concepts) ? args.concepts : [];

    const concepts = rawConcepts
      .map((c, i) => ({
        label: str(c.label, 80) || `Concept ${i + 1}`,
        prompt: str(c.prompt, 12_000),
        rationale: str(c.rationale, 400),
      }))
      .filter((c) => isUsablePrompt(c.prompt))
      .slice(0, 4);

    return json({
      reply:
        str(args.reply, 2_000) ||
        (concepts.length > 0
          ? `Rendering ${concepts.length} direction${concepts.length === 1 ? "" : "s"}.`
          : "Tell me a bit more and I'll put something on the board."),
      concepts,
      // Named so the board can show WHICH of the agency's own documents
      // shaped these directions, instead of asking anyone to take it on faith.
      knowledge: knowledgeSummary(ragContext),
    });
  } catch (err) {
    console.error("[plan-concepts]", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
