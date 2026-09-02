// deck-revise — turns free-text deck feedback into structured DeckOps.
//
// The client owns the deck (a deterministic DeckSpec + design settings —
// see src/lib/deckOps.ts). This function never renders anything: it reads a
// compact summary of the current deck plus the user's feedback and returns
// an ordered list of operations from a CLOSED vocabulary, which the client
// validates and applies. That keeps every revision accurate to project data
// and consistent with the designed slide system.
//
// Request  { summary: string, feedback: string, selectedSlide?: number,
//            history?: Array<{ role: "user"|"assistant", content: string }> }
// Response { ops: DeckOp[], reply: string, fn_version: 1 }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic } from "../_shared/ai-gateway.ts";
import { buildUsageContext } from "../_shared/usage-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const FN_VERSION = 1;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify({ ...(body as Record<string, unknown>), fn_version: FN_VERSION }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const HEX = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
const SLIDE_LAYOUTS = [
  "cover", "section", "briefSummary", "concept", "elementGrid", "spatial",
  "renderFull", "renderGrid", "budget", "materials", "nextSteps", "closing",
];

/** Closed op vocabulary — mirrors src/lib/deckOps.ts. strict: true so the
 *  arguments always validate; the client re-validates anyway. */
const REVISE_TOOL = {
  name: "apply_deck_changes",
  description:
    "Apply the user's feedback to the deck as an ordered list of structured operations, then explain briefly what changed.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["ops", "reply"],
    properties: {
      reply: {
        type: "string",
        description:
          "One or two plain sentences telling the user what you changed (or why something couldn't be done). No markdown.",
      },
      ops: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["op"],
          properties: {
            op: {
              type: "string",
              enum: [
                "set_style", "set_brand_mode", "set_palette", "set_fonts",
                "set_render_presentation", "update_slide", "set_slide_overrides",
                "remove_slide", "reorder_slides", "insert_slide", "duplicate_slide",
              ],
            },
            style: { type: "string", enum: ["pitch", "executive", "editorial", "tactical"] },
            mode: { type: "string", enum: ["agency", "client", "blend", "full", "mixed", "grid"] },
            primary: HEX,
            secondary: HEX,
            headingFontId: { type: "string" },
            bodyFontId: { type: "string" },
            index: { type: "integer", minimum: 0 },
            order: { type: "array", items: { type: "integer", minimum: 0 } },
            patch: {
              type: "object",
              description:
                "Partial slide content to merge: title, subtitle, headline, body, caption, bullets/points/items (arrays of strings), rows. Never includes layout.",
              additionalProperties: true,
              properties: {},
            },
            overrides: {
              type: "object",
              additionalProperties: false,
              properties: {
                ground: { type: "string", enum: ["primary", "paper", "ink"] },
                hideLogo: { type: "boolean" },
                accent: { type: "string", enum: ["quiet", "normal", "loud"] },
                notes: { type: "string" },
              },
            },
            slide: {
              type: "object",
              description: "A complete new slide for insert_slide.",
              additionalProperties: true,
              required: ["layout"],
              properties: { layout: { type: "string", enum: SLIDE_LAYOUTS } },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You revise a trade-show proposal deck for an experiential agency. The deck is a DESIGNED slide system — you cannot draw; you emit operations that the app applies. Ground rules:
- Prefer the smallest set of ops that satisfies the feedback. Never rewrite slides the user did not mention.
- Design asks map to design ops: tone/feel → set_style (pitch=bold brand-color, executive=restrained/high-whitespace, editorial=magazine typography/prose, tactical=numbers-forward); colors → set_palette with hex (the user may name a color — pick a tasteful hex); fonts → set_fonts using ONLY these ids: inter, manrope, work-sans, archivo, space-grotesk, sora, bricolage, outfit, poppins, dm-sans, source-serif, fraunces, playfair, lora, libre-baskerville, ibm-plex-mono; whose brand leads → set_brand_mode; "more full-slide renders" → set_render_presentation full; "quieter cover" / "put slide 3 on white" → set_slide_overrides with ground/accent.
- Content asks map to update_slide with a partial patch (shorter copy, new headline, reorder bullets). Keep facts as given — never invent numbers, dates, dimensions, or client claims. If the feedback needs data you don't have, say so in reply instead of guessing.
- Structure asks: remove_slide / reorder_slides (full permutation of current indices) / duplicate_slide / insert_slide (section dividers and nextSteps are safe to insert; only insert image slides if the user names an existing image).
- Slide indices are 0-based and refer to the CURRENT order given in the summary. When the user says "slide 5" they mean the 1-based number shown on thumbnails — subtract 1.
- If the user selected a slide, feedback without an explicit target applies to that slide.
- reply is short, specific, and honest about anything skipped.`;

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
    const summary: string = String(body.summary ?? "").slice(0, 12_000);
    const feedback: string = String(body.feedback ?? "").trim().slice(0, 4_000);
    const selectedSlide: number | null =
      typeof body.selectedSlide === "number" ? body.selectedSlide : null;
    const history: Array<{ role: string; content: string }> = Array.isArray(body.history)
      ? body.history.slice(-8).map((h: { role: string; content: string }) => ({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content ?? "").slice(0, 2_000),
        }))
      : [];
    if (!feedback) return json({ error: "feedback required" }, 400);

    const userTurn =
      `CURRENT DECK\n${summary}\n\n` +
      (selectedSlide !== null ? `SELECTED SLIDE INDEX: ${selectedSlide}\n\n` : "") +
      `FEEDBACK:\n${feedback}`;

    const result = await callAnthropic({
      usage: await buildUsageContext(req, "deck-revise").catch(() => undefined),
      system: SYSTEM,
      messages: [...history, { role: "user", content: userTurn }],
      tools: [REVISE_TOOL],
      toolChoice: { type: "tool", name: "apply_deck_changes" },
      maxTokens: 4096,
    });

    const call = result.toolCalls?.find((c) => c.name === "apply_deck_changes");
    if (!call) return json({ error: "Model returned no changes", reply: result.text ?? "" }, 502);
    const args = call.arguments ?? {};
    return json({
      ops: Array.isArray(args.ops) ? args.ops : [],
      reply: typeof args.reply === "string" ? args.reply : "Applied your feedback.",
    });
  } catch (err) {
    console.error("[deck-revise]", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
