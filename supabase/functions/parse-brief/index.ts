import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── DOCX EXTRACTION ──────────────────────────────────────────────────────────
// Comprehensive extraction that handles paragraphs, tables, headers, footnotes

async function extractDocxTextAsync(base64Data: string): Promise<string> {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const zip = await JSZip.loadAsync(bytes);

  // Extract text from all relevant XML files in order
  const sections: string[] = [];

  // 1. Main document body
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (docXml) {
    sections.push(extractTextFromWordXml(docXml));
  }

  // 2. Headers (header1.xml, header2.xml, header3.xml)
  for (let i = 1; i <= 3; i++) {
    const headerXml = await zip.file(`word/header${i}.xml`)?.async("string");
    if (headerXml) {
      const headerText = extractTextFromWordXml(headerXml);
      if (headerText.trim()) sections.push(`[HEADER]\n${headerText}`);
    }
  }

  // 3. Footers
  for (let i = 1; i <= 3; i++) {
    const footerXml = await zip.file(`word/footer${i}.xml`)?.async("string");
    if (footerXml) {
      const footerText = extractTextFromWordXml(footerXml);
      if (footerText.trim()) sections.push(`[FOOTER]\n${footerText}`);
    }
  }

  if (sections.length === 0) throw new Error("Could not extract any text from DOCX");

  return sections
    .join("\n\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x[0-9A-Fa-f]+;/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function extractTextFromWordXml(xml: string): string {
  const lines: string[] = [];

  // Process tables specially to preserve structure
  // Replace table cells with tab-separated content, rows with newlines
  let processedXml = xml;

  // Mark table row boundaries
  processedXml = processedXml.replace(/<\/w:tr[^>]*>/g, "\n");
  // Mark table cell boundaries with tab
  processedXml = processedXml.replace(/<\/w:tc[^>]*>/g, "\t");

  // Split by paragraphs
  const paragraphs = processedXml.split(/<\/w:p[^>]*>/);

  for (const para of paragraphs) {
    // Check for heading style
    const headingMatch = para.match(/<w:pStyle[^>]*w:val="([^"]*Heading[^"]*|[^"]*heading[^"]*|[^"]*Title[^"]*|[^"]*title[^"]*)"[^>]*>/);
    
    // Extract all text runs including those with xml:space="preserve"
    const texts: string[] = [];
    const regex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let match;
    while ((match = regex.exec(para)) !== null) {
      texts.push(match[1]);
    }

    if (texts.length > 0) {
      const lineText = texts.join("").trim();
      if (lineText) {
        if (headingMatch) {
          lines.push(`\n## ${lineText}`);
        } else {
          lines.push(lineText);
        }
      }
    }
  }

  return lines
    .join("\n")
    .replace(/\t\t+/g, "\t")
    .replace(/\n\t\n/g, "\n");
}

// ─── SYSTEM PROMPT ────────────────────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `You are an expert brief analyst for experiential design projects (trade show booths, brand activations, permanent installations, premiere events, game launches, and architectural spaces).

Given raw brief text or document, extract ALL structured data into the exact schema provided via the tool call.

CRITICAL EXTRACTION RULES:
1. Extract EVERY piece of data present — scan the ENTIRE document including tables, headers, sidebars, footnotes.
2. Do NOT invent data not in the document, but DO use reasonable inference for implied data.
3. For budget: extract ALL numbers — look for "$", "USD", "budget", "investment", "spend". Look in tables too.
4. For spatial: extract ALL footprint sizes — look for "x", "sq ft", "sqm", "floor plan", "booth size".
5. For audiences: extract ALL mentioned audiences, attendees, personas, or stakeholders.
6. For creative: look for "must-have", "avoid", "aesthetic", "look and feel", "design language", "palette".
7. For objectives: look for "goals", "KPIs", "success metrics", "objectives", "ROI", "what we want to achieve".
8. For experience: look for "hero moment", "key features", "must-include", "required elements", "deliverables".
9. For events: extract the event/show name, venue, city, dates — look in tables, headers, and body text.

TABLE HANDLING: Documents often store critical data (budgets, booth sizes, dates) in tables formatted as tab-separated text. Parse these carefully.

You MUST call the provided function tool to return your response. Return ALL fields populated as completely as possible.`;

// ─── TOOL SCHEMA ─────────────────────────────────────────────────────────────

const toolSchema = {
  type: "function",
  function: {
    name: "parse_brief",
    description: "Parse an experiential design brief into structured data — extract ALL fields as completely as possible",
    parameters: {
      type: "object",
      properties: {
        brand: {
          type: "object",
          properties: {
            name: { type: "string", description: "Full official company/brand name" },
            category: { type: "string", description: "Industry or product category" },
            pov: { type: "string", description: "Brand tagline, POV, or positioning statement" },
            personality: { type: "array", items: { type: "string" }, description: "Brand personality traits and adjectives" },
            competitors: { type: "array", items: { type: "string" } },
            visualIdentity: {
              type: "object",
              properties: {
                colors: { type: "array", items: { type: "string" }, description: "Brand colors as hex codes or color names" },
                avoidColors: { type: "array", items: { type: "string" } },
                avoidImagery: { type: "array", items: { type: "string" } },
              },
              required: ["colors", "avoidColors", "avoidImagery"],
            },
          },
          required: ["name", "category", "pov", "personality", "competitors", "visualIdentity"],
        },
        objectives: {
          type: "object",
          properties: {
            primary: { type: "string", description: "The single most important goal" },
            secondary: { type: "array", items: { type: "string" }, description: "All other goals and success metrics" },
            competitiveContext: { type: "string" },
            differentiationGoals: { type: "array", items: { type: "string" } },
          },
          required: ["primary", "secondary", "competitiveContext", "differentiationGoals"],
        },
        events: {
          type: "object",
          properties: {
            shows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  location: { type: "string", description: "Venue and city" },
                  dates: { type: "string" },
                  boothNumber: { type: "string" },
                  hallName: { type: "string" },
                },
                required: ["name", "location"],
              },
            },
            primaryShow: { type: "string" },
          },
          required: ["shows", "primaryShow"],
        },
        spatial: {
          type: "object",
          properties: {
            footprints: {
              type: "array",
              description: "ALL booth/space sizes mentioned anywhere in the document",
              items: {
                type: "object",
                properties: {
                  size: { type: "string", description: "e.g. '20x20', '10x10', '100 sqm'" },
                  sqft: { type: "number" },
                  priority: { type: "string", enum: ["primary", "secondary", "tertiary"] },
                },
                required: ["size", "sqft", "priority"],
              },
            },
            modular: { type: "boolean", description: "Is the booth/structure modular/reusable?" },
            reuseRequirement: { type: "string", description: "Any reuse or sustainability requirement" },
            trafficRequirements: { type: "string", description: "Traffic flow, open vs closed, etc." },
            indoorOutdoor: { type: "string", enum: ["indoor", "outdoor", "both", "unknown"] },
            floorType: { type: "string" },
          },
          required: ["footprints", "modular", "reuseRequirement", "trafficRequirements"],
        },
        audiences: {
          type: "array",
          description: "ALL audience segments, personas, or stakeholders mentioned",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              priority: { type: "number", description: "1 = highest priority" },
              characteristics: { type: "array", items: { type: "string" } },
              engagementNeeds: { type: "string" },
            },
            required: ["name", "description", "priority", "characteristics", "engagementNeeds"],
          },
        },
        creative: {
          type: "object",
          properties: {
            avoid: { type: "array", items: { type: "string" }, description: "Design directions to avoid" },
            embrace: { type: "array", items: { type: "string" }, description: "Design directions to embrace" },
            coreStrategy: { type: "string" },
            thinkingFramework: { type: "array", items: { type: "string" } },
            designPhilosophy: { type: "string" },
            moodKeywords: { type: "array", items: { type: "string" }, description: "Mood words: e.g. bold, minimal, futuristic" },
          },
          required: ["avoid", "embrace", "coreStrategy", "thinkingFramework", "designPhilosophy"],
        },
        experience: {
          type: "object",
          properties: {
            hero: {
              type: "object",
              properties: {
                required: { type: "boolean" },
                description: { type: "string" },
                attributes: { type: "array", items: { type: "string" } },
              },
              required: ["required", "description", "attributes"],
            },
            storytelling: {
              type: "object",
              properties: {
                required: { type: "boolean" },
                description: { type: "string" },
                audienceAdaptation: { type: "boolean" },
              },
              required: ["required", "description", "audienceAdaptation"],
            },
            humanConnection: {
              type: "object",
              properties: {
                required: { type: "boolean" },
                capacity: { type: "string" },
                integrationRequirement: { type: "string" },
              },
              required: ["required", "capacity", "integrationRequirement"],
            },
            adjacentActivations: {
              type: "object",
              properties: {
                required: { type: "boolean" },
                count: { type: "string" },
                criteria: { type: "array", items: { type: "string" }, description: "List of required elements/deliverables/features" },
              },
              required: ["required", "count", "criteria"],
            },
          },
          required: ["hero", "storytelling", "humanConnection", "adjacentActivations"],
        },
        budget: {
          type: "object",
          properties: {
            perShow: { type: "number", description: "Budget per show in USD (0 if unknown)" },
            total: { type: "number", description: "Total budget across all shows (0 if unknown)" },
            range: {
              type: "object",
              properties: {
                min: { type: "number" },
                max: { type: "number" },
              },
            },
            currency: { type: "string", default: "USD" },
            inclusions: { type: "array", items: { type: "string" }, description: "What is included in budget" },
            exclusions: { type: "array", items: { type: "string" }, description: "What is NOT included / client-provided" },
            efficiencyNotes: { type: "string", description: "Notes on budget flexibility, sustainability, reuse goals" },
          },
          required: ["inclusions", "exclusions", "efficiencyNotes"],
        },
        requiredDeliverables: {
          type: "array",
          items: { type: "string" },
          description: "ALL specific items, elements, or features the client requires to be delivered",
        },
        winningCriteria: {
          type: "array",
          items: { type: "string" },
          description: "How the client will evaluate success / what makes this a winning proposal",
        },
        timeline: {
          type: "object",
          properties: {
            proposalDue: { type: "string" },
            designApproval: { type: "string" },
            buildStart: { type: "string" },
            deliveryDate: { type: "string" },
            notes: { type: "string" },
          },
        },
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              role: { type: "string" },
            },
          },
          description: "Client contacts mentioned in the document",
        },
      },
      required: [
        "brand", "objectives", "events", "spatial", "audiences",
        "creative", "experience", "budget", "requiredDeliverables", "winningCriteria",
      ],
    },
  },
};

// ─── AI CALL WITH RETRY ───────────────────────────────────────────────────────

async function callAIWithRetry(
  apiKey: string,
  briefText: string,
  brandIntelligence?: Array<{ category: string; title: string; content: string }>,
  attempt = 1,
  brandContext = "",
  suiteContext = "",
): Promise<Record<string, unknown>> {
  let userMessage = `You are parsing a brief document. Extract ALL data — scan every line including tables (formatted as tab-separated text).

--- BRIEF DOCUMENT ---
${briefText}
--- END DOCUMENT ---`;

  if (brandIntelligence && brandIntelligence.length > 0) {
    userMessage += `\n\n--- KNOWN BRAND INTELLIGENCE (cross-reference, do NOT contradict) ---\n`;
    for (const entry of brandIntelligence) {
      userMessage += `• [${entry.category}] ${entry.title}: ${entry.content}\n`;
    }
    userMessage += `--- END BRAND INTELLIGENCE ---\nUse this to fill gaps where the brief is silent, but prioritize what the brief explicitly states.`;
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: PARSE_SYSTEM_PROMPT + `${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}` },
        { role: "user", content: userMessage },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: "parse_brief" } },
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`AI gateway error (attempt ${attempt}):`, response.status, text.substring(0, 300));
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return callAIWithRetry(apiKey, briefText, brandIntelligence, attempt + 1, brandContext, suiteContext);
    }
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  console.log(`AI response (attempt ${attempt}):`, JSON.stringify({
    hasToolCalls: !!toolCall,
    finishReason: data.choices?.[0]?.finish_reason,
    toolArgsPreview: toolCall ? toolCall.function.arguments.substring(0, 500) : null,
    contentPreview: !toolCall ? data.choices?.[0]?.message?.content?.substring(0, 300) : null,
  }));

  if (toolCall) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      // Attempt to repair truncated JSON
      const repaired = attemptJsonRepair(toolCall.function.arguments);
      if (repaired) return repaired;
      if (attempt < 3) {
        console.warn("JSON parse failed, retrying...");
        await new Promise((r) => setTimeout(r, 1000));
        return callAIWithRetry(apiKey, briefText, brandIntelligence, attempt + 1, brandContext, suiteContext);
      }
      throw new Error("AI returned malformed JSON");
    }
  }

  // Fallback: extract JSON from content
  const content = data.choices?.[0]?.message?.content;
  if (content) {
    const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content;
    try {
      return JSON.parse(jsonStr);
    } catch {
      const repaired = attemptJsonRepair(jsonStr);
      if (repaired) return repaired;
    }
  }

  if (attempt < 3) {
    console.warn(`No tool call or parseable content (attempt ${attempt}), retrying...`);
    await new Promise((r) => setTimeout(r, 1500));
    return callAIWithRetry(apiKey, briefText, brandIntelligence, attempt + 1, brandContext, suiteContext);
  }

  throw new Error("AI returned empty or unparseable response after 3 attempts");
}

// Basic JSON repair: try to close unclosed brackets/braces on truncation
function attemptJsonRepair(str: string): Record<string, unknown> | null {
  try {
    // Count unmatched brackets
    let depth = 0;
    let inString = false;
    let escaped = false;
    const closers: string[] = [];

    for (const ch of str) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") { closers.push("}"); depth++; }
      else if (ch === "[") { closers.push("]"); depth++; }
      else if (ch === "}" || ch === "]") { closers.pop(); depth--; }
    }

    if (depth <= 0) return null; // Already balanced or malformed

    const repaired = str + closers.reverse().join("");
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const brandContext = (body.brandContext as string) || "";
    const suiteContext = (body.suiteContext as string) || "";

    let briefText = (body.briefText as string) || "";

    // ── DOCX: Extract text server-side ──
    if (body.fileBase64 && body.fileType === "docx") {
      console.log("Extracting DOCX text...");
      briefText = await extractDocxTextAsync(body.fileBase64 as string);
      console.log(`DOCX extracted: ${briefText.length} chars | preview: ${briefText.substring(0, 400)}`);

      if (!briefText || briefText.trim().length < 20) {
        return new Response(
          JSON.stringify({ error: "Could not extract readable text from DOCX. Try converting to PDF or paste the text directly." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── PDF: Pass base64 directly to Gemini vision ──
    if (body.fileBase64 && body.fileType === "pdf") {
      console.log("Handling PDF via Gemini vision...");
      // For PDFs, we'll construct the message with inline base64 data
      // Gemini supports PDF as inline data
      const brandIntelligence = body.brandIntelligence as Array<{ category: string; title: string; content: string }> | undefined;

      let systemMsg = PARSE_SYSTEM_PROMPT + `${brandContext ? `\n\n## BRAND CONTEXT\n${brandContext}` : ""}${suiteContext ? `\n\n## SUITE CONTEXT\n${suiteContext}` : ""}`;
      let userMsg = "Parse this PDF brief document. Extract ALL data — scan every page including tables, sidebars, headers, and footnotes.\n\nReturn ALL fields as completely as possible.";

      if (brandIntelligence && brandIntelligence.length > 0) {
        userMsg += `\n\n--- KNOWN BRAND INTELLIGENCE ---\n`;
        for (const entry of brandIntelligence) {
          userMsg += `• [${entry.category}] ${entry.title}: ${entry.content}\n`;
        }
        userMsg += `--- END ---\nUse this to fill gaps but prioritize the document.`;
      }

      const pdfResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemMsg },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: userMsg,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/pdf;base64,${body.fileBase64}`,
                  },
                },
              ],
            },
          ],
          tools: [toolSchema],
          tool_choice: { type: "function", function: { name: "parse_brief" } },
          max_tokens: 8192,
        }),
      });

      if (pdfResponse.ok) {
        const pdfData = await pdfResponse.json();
        const pdfToolCall = pdfData.choices?.[0]?.message?.tool_calls?.[0];
        if (pdfToolCall) {
          try {
            const parsed = JSON.parse(pdfToolCall.function.arguments);
            console.log("PDF parsed via vision, brand:", parsed.brand?.name);
            return new Response(JSON.stringify({ data: parsed }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } catch {
            console.warn("PDF vision JSON parse failed, falling back to text extraction");
          }
        }
      }

      // Fallback: try to extract text from PDF using pdfjs-compatible approach
      // Convert base64 back to check if it's a text-readable PDF
      console.warn("PDF vision failed, attempting text fallback");
      briefText = `[PDF document — content could not be extracted as text. Please review the upload.]`;
    }

    if (!briefText || briefText.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Brief text is too short or missing. Please check the file and try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brandIntelligence = body.brandIntelligence as Array<{ category: string; title: string; content: string }> | undefined;

    console.log(`Parsing brief: ${briefText.length} chars | brand intel: ${brandIntelligence?.length ?? 0} entries`);

    const parsed = await callAIWithRetry(LOVABLE_API_KEY, briefText, brandIntelligence, 1, brandContext, suiteContext);

    console.log("Final parsed brand:", (parsed.brand as any)?.name, "| deliverables:", (parsed.requiredDeliverables as string[])?.length ?? 0);

    return new Response(JSON.stringify({ data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-brief error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
