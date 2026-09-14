// parse-client-feedback — turns a client's messy post-export notes into
// targeted, per-image revision instructions.
//
// The client (agency user) pastes whatever the client sent — an email, a
// slack dump, meeting notes, comments scraped off a marked-up PDF — and
// this function maps each actionable note onto the renders that already
// exist for the project. It NEVER renders anything and never invents
// project facts: it only rewrites the note as an IMAGE EDIT instruction
// that names what changes and locks everything else. The client then
// runs each instruction through generate-hero's EDIT MODE
// (previousImageUrl + feedback, no composedPrompt) — see
// src/lib/feedbackRevision.ts.
//
// Request  { feedback: string,
//            images: Array<{ angleId: string, angleName: string, caption?: string }>,
//            boothSizeLabel?: string,
//            brief?: string }
// Response { summary: string,
//            items: Array<{ angleId: string | "all", instruction: string,
//                           scope: "global" | "single", confidence: number }>,
//            fn_version: 1 }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";
import { buildUsageContext } from "../_shared/usage-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FN_VERSION = 1;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ ...(body as Record<string, unknown>), fn_version: FN_VERSION }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Plain (NOT strict) tool — the strict subset rejects several of the
 *  validation keywords used here and demands every property be required,
 *  which this partially-optional vocabulary can't satisfy. The client
 *  validates the payload (isValidRevisionItem in feedbackRevision.ts). */
const PLAN_TOOL = {
  name: "plan_revisions",
  description:
    "Translate a client's plain-language feedback on a set of renders into precise, per-image revision instructions, plus a short summary of anything that is not an image edit.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "items"],
    properties: {
      summary: {
        type: "string",
        description:
          "Two to four plain sentences: what the client is asking for overall, and — explicitly — any note that is NOT actionable as an image edit (pricing, timelines, deliverables, questions to answer). No markdown.",
      },
      items: {
        type: "array",
        description:
          "One entry per actionable image change. Merge duplicate notes about the same change into one item; never emit an item for a note that cannot be executed by editing a render.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["angleId", "instruction", "scope", "confidence"],
          properties: {
            angleId: {
              type: "string",
              description:
                'The angleId of the single render this change applies to, exactly as given in AVAILABLE RENDERS — or the literal string "all" when the change applies to every render in the set.',
            },
            scope: {
              type: "string",
              enum: ["global", "single"],
              description:
                '"global" when angleId is "all" (brand colour, signage copy, a material used throughout); "single" when the note is about one view.',
            },
            instruction: {
              type: "string",
              description:
                "The image edit instruction. Name ONLY what changes, in concrete visual terms, and state what stays untouched. One short paragraph, no markdown, no headings, no numbered lists.",
            },
            confidence: {
              type: "number",
              description:
                "0-1. How certain you are that this is what the client meant AND that it maps to this target. Vague notes ('make it pop') get a low number.",
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You translate a trade-show client's plain-language feedback on presentation renders into precise IMAGE EDIT instructions for an image model.

The renders already exist. You are not designing a booth and you are not regenerating anything — every instruction you write is applied as a surgical edit of one existing image, where the source image is the authoritative version and only the named change happens.

Rules:
- Each instruction names ONLY what changes, in concrete visual terms, and explicitly preserves everything else: booth structure and footprint, camera angle and composition, lighting, people, furnishings, environment, and every material or colour the client did not mention.
- Translate feeling into geometry. "The lounge feels cramped" becomes fewer/smaller seating pieces and more open floor between them — not a redesign. "Can the sign be bigger" becomes a larger sign in the same position and style. "We hate the blue" becomes the specific surfaces that read blue, recoloured to what the client asked for (or, if they named no replacement, to a neutral that suits the rest of the palette) — and say so plainly.
- Scope: use "all" when the note is about the whole set (brand colour, a logo or signage treatment, a material used throughout, overall mood). Use a specific angleId when the note is about one view ("in the wide shot the counter is too far left"). If a note names a view you were not given, map it to the closest angleName you WERE given and lower the confidence.
- Never invent dimensions, budgets, materials, brand names, product names, headline copy, or any client fact you were not given. If the client asks for text you do not have, say the copy is unchanged rather than inventing words.
- Do not stack unrelated changes into one instruction — one change per item, so the user can include or exclude each independently.
- If a note is not actionable as an image edit (a pricing question, a deadline, "send us the floor plan", an approval), do NOT invent an item for it. Put it in summary so a human can act on it.
- If the feedback contains nothing actionable as an image edit, return an empty items array and explain that in summary.
- Plain prose only. No markdown, no headings, no bullet characters.`;

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

    const body = await req.json();

    const feedback: string = String(body?.feedback ?? "").trim().slice(0, 20_000);
    if (!feedback) return json({ error: "feedback required" }, 400);

    const rawImages: unknown = body?.images;
    const images: Array<{ angleId: string; angleName: string; caption?: string }> = Array.isArray(
      rawImages,
    )
      ? rawImages
          .slice(0, 40)
          .map((img: Record<string, unknown>) => ({
            angleId: String(img?.angleId ?? "").trim(),
            angleName: String(img?.angleName ?? "").trim(),
            caption:
              typeof img?.caption === "string" && img.caption.trim()
                ? img.caption.trim().slice(0, 300)
                : undefined,
          }))
          .filter((img) => img.angleId.length > 0)
      : [];
    if (images.length === 0) return json({ error: "images required" }, 400);

    const boothSizeLabel: string = String(body?.boothSizeLabel ?? "").trim().slice(0, 80);
    const brief: string = String(body?.brief ?? "").trim().slice(0, 6_000);

    const renderList = images
      .map(
        (img) =>
          `- angleId: ${img.angleId} · view: ${img.angleName}${img.caption ? ` · ${img.caption}` : ""}`,
      )
      .join("\n");

    const userTurn = [
      boothSizeLabel ? `BOOTH SIZE: ${boothSizeLabel}` : "",
      brief ? `PROJECT CONTEXT (background only — never quote numbers back that the client did not raise):\n${brief}` : "",
      `AVAILABLE RENDERS (use these angleId values verbatim, or "all"):\n${renderList}`,
      `CLIENT FEEDBACK (verbatim — may be an email, notes, or a transcript):\n${feedback}`,
      "Plan the revisions.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await callAnthropic({
      usage: await buildUsageContext(req, "parse-client-feedback").catch(() => undefined),
      system: SYSTEM,
      messages: [{ role: "user", content: userTurn }],
      tools: [PLAN_TOOL],
      toolChoice: { type: "tool", name: "plan_revisions" },
      maxTokens: 4096,
      // NOTE: no temperature — the Claude 5 family rejects sampling params.
    });

    const call = result.toolCalls?.find((c) => c.name === "plan_revisions");
    if (!call) {
      return json({ error: "Model returned no revision plan", summary: result.text ?? "" }, 502);
    }

    const args = (call.arguments ?? {}) as Record<string, unknown>;
    const knownAngleIds = new Set(images.map((i) => i.angleId));

    const items = (Array.isArray(args.items) ? args.items : [])
      .map((raw: Record<string, unknown>) => {
        const angleId = String(raw?.angleId ?? "").trim();
        const instruction = String(raw?.instruction ?? "").trim();
        const scope = raw?.scope === "global" || angleId === "all" ? "global" : "single";
        const confidenceRaw = typeof raw?.confidence === "number" ? raw.confidence : 0.5;
        return {
          angleId,
          instruction,
          scope,
          confidence: Math.max(0, Math.min(1, confidenceRaw)),
        };
      })
      // Drop anything that names a render we didn't send — better to lose a
      // mis-targeted item than to silently edit the wrong image.
      .filter((item) => item.instruction.length > 0)
      .filter((item) => item.angleId === "all" || knownAngleIds.has(item.angleId));

    return json({
      summary: typeof args.summary === "string" ? args.summary : "",
      items,
    });
  } catch (err) {
    console.error("[parse-client-feedback]", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
