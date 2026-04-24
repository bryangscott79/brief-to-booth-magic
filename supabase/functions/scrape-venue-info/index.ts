// Scrape Venue Info
// Given a show or venue URL (e.g. CES, NAB, official venue site), scrapes the
// page via Firecrawl and uses Gemini to extract structured venue intelligence:
// show name, venue, city, industry, design tips, traffic patterns, audience
// notes, logistics notes, booth placement tips, typical booth sizes, union labor.

import { callGemini } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Firecrawl connector not configured. Please connect Firecrawl in Settings → Connectors.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let formattedUrl = url.trim();
    if (
      !formattedUrl.startsWith("http://") &&
      !formattedUrl.startsWith("https://")
    ) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log("[scrape-venue-info] scraping:", formattedUrl);

    // 1) Scrape the page (markdown + summary + metadata)
    const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ["markdown", "summary"],
        onlyMainContent: true,
        waitFor: 2500,
      }),
    });

    const fcData = await fcRes.json();
    if (!fcRes.ok) {
      console.error("[scrape-venue-info] Firecrawl error:", fcData);
      return new Response(
        JSON.stringify({
          success: false,
          error: fcData.error || `Scrape failed (${fcRes.status})`,
        }),
        {
          status: fcRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const payload = fcData.data || fcData;
    const markdown = String(payload.markdown || "").slice(0, 14000);
    const summary = payload.summary || "";
    const metadata = payload.metadata || {};

    // 2) Ask Gemini to extract structured venue intelligence
    const systemPrompt = `You are an experiential design researcher. Given a public web page about a trade show or convention venue, extract a structured intelligence profile that helps booth designers plan effectively.

Rules:
- Return concise, factual content. If a field is genuinely unknown, leave it empty.
- Design tips and booth placement tips should be specific, actionable bullet points (not marketing fluff).
- Booth sizes should be standard formats like "10x10", "20x20", "30x30".
- Industry should be a short label like "Consumer Electronics" or "Broadcast Media".`;

    const userPrompt = `URL: ${formattedUrl}
TITLE: ${metadata.title || "(none)"}
DESCRIPTION: ${metadata.description || "(none)"}

—— AI SUMMARY ——
${summary || "(none)"}

—— PAGE CONTENT (truncated) ——
${markdown}

Extract venue intelligence using the build_venue_intelligence tool.`;

    const tool = {
      type: "function",
      function: {
        name: "build_venue_intelligence",
        description:
          "Extract structured venue / show intelligence from the supplied page content.",
        parameters: {
          type: "object",
          properties: {
            showName: {
              type: "string",
              description:
                "Official show or event name (e.g. 'CES 2026'). If only a venue, use the venue name.",
            },
            venue: {
              type: "string",
              description:
                "Venue building name (e.g. 'Las Vegas Convention Center').",
            },
            city: {
              type: "string",
              description: "City and state/country (e.g. 'Las Vegas, NV').",
            },
            industry: {
              type: "string",
              description: "Primary industry vertical.",
            },
            designTips: {
              type: "array",
              items: { type: "string" },
              description:
                "Actionable design tips for booth structure, ceiling height, lighting, sightlines, etc.",
            },
            trafficPatterns: {
              type: "string",
              description: "Description of typical foot traffic flow.",
            },
            audienceNotes: {
              type: "string",
              description:
                "Key demographics, decision makers, buyer types attending.",
            },
            logisticsNotes: {
              type: "string",
              description:
                "Load-in/load-out windows, dock access, freight restrictions.",
            },
            boothPlacementTips: {
              type: "string",
              description:
                "Best halls, corner vs inline, proximity to entrances or main stages.",
            },
            typicalBoothSizes: {
              type: "array",
              items: { type: "string" },
              description: "Common booth size formats offered.",
            },
            unionLaborRequired: {
              type: "boolean",
              description:
                "True if union labor is required for installation/dismantle.",
            },
          },
          required: ["showName"],
        },
      },
    };

    const ai = await callGemini({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [tool],
      toolChoice: {
        type: "function",
        function: { name: "build_venue_intelligence" },
      },
      temperature: 0.3,
      maxTokens: 2048,
    });

    const extracted = ai.toolCalls?.[0]?.arguments || {};

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          showName: extracted.showName || metadata.title || "",
          venue: extracted.venue || "",
          city: extracted.city || "",
          industry: extracted.industry || "",
          designTips: Array.isArray(extracted.designTips)
            ? extracted.designTips
            : [],
          trafficPatterns: extracted.trafficPatterns || "",
          audienceNotes: extracted.audienceNotes || "",
          logisticsNotes: extracted.logisticsNotes || "",
          boothPlacementTips: extracted.boothPlacementTips || "",
          typicalBoothSizes: Array.isArray(extracted.typicalBoothSizes)
            ? extracted.typicalBoothSizes
            : [],
          unionLaborRequired: !!extracted.unionLaborRequired,
        },
        sourceUrl: formattedUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[scrape-venue-info] error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to scrape venue";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
