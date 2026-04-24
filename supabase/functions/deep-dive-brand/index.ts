// Deep Dive Brand
// Given a website URL + client name, scrapes the homepage + key brand pages
// (about, mission, values) via Firecrawl, then asks Gemini 2.5 Pro to extract
// a comprehensive structured brand profile: mission, vision, values, tone of
// voice, personality, sentiment, target audience, messaging pillars, dos/don'ts,
// competitors, plus colors, fonts, and logo URL pulled from Firecrawl branding.
//
// Returns:
//   - entries[]   : brand_intelligence rows ready for batchCreate (pending review)
//   - guidelines  : structured brand_guidelines payload (color_system, typography,
//                   tone_of_voice, photography_style, logo_rules, materials_finishes)
//   - logoUrl     : best-guess primary logo URL
//   - colors      : { primary, secondary } convenience for the clients table

import { callGemini } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── FIRECRAWL HELPERS ──────────────────────────────────────────────────────

async function firecrawlScrape(url: string, apiKey: string, formats: any[]) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats,
      onlyMainContent: false,
      waitFor: 2500,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.warn(`[deep-dive] Firecrawl scrape failed for ${url}:`, data?.error || res.status);
    return null;
  }
  return data.data || data;
}

async function firecrawlMap(url: string, apiKey: string, search: string) {
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/map", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, search, limit: 10 }),
    });
    const data = await res.json();
    if (!res.ok) return [];
    return (data.links || []) as string[];
  } catch {
    return [];
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, clientName, industry } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl is not connected. Connect Firecrawl in Connectors first." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let baseUrl = url.trim();
    if (!baseUrl.startsWith("http")) baseUrl = `https://${baseUrl}`;
    // Normalise to origin for mapping
    let origin = baseUrl;
    try {
      origin = new URL(baseUrl).origin;
    } catch { /* keep as-is */ }

    console.log(`[deep-dive] Starting for ${clientName ?? "(unnamed)"} @ ${baseUrl}`);

    // ─── 1) Scrape homepage with branding + markdown + summary ──────────────
    const home = await firecrawlScrape(baseUrl, apiKey, ["branding", "markdown", "summary"]);
    if (!home) {
      return new Response(
        JSON.stringify({ success: false, error: "Could not reach the website. Check the URL and try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 2) Find brand-relevant subpages ───────────────────────────────────
    const subLinks = await firecrawlMap(origin, apiKey, "about mission values brand story");
    const candidatePaths = ["about", "our-story", "story", "mission", "values", "purpose", "company", "who-we-are"];
    const picked = new Set<string>();
    for (const link of subLinks) {
      const lower = link.toLowerCase();
      if (candidatePaths.some((p) => lower.includes(`/${p}`))) {
        picked.add(link);
        if (picked.size >= 3) break;
      }
    }

    // ─── 3) Scrape up to 3 brand subpages (markdown only, faster) ──────────
    const subPageContent: string[] = [];
    for (const link of Array.from(picked).slice(0, 3)) {
      const sub = await firecrawlScrape(link, apiKey, ["markdown", "summary"]);
      if (sub?.markdown) {
        subPageContent.push(`# ${link}\n${(sub.summary ? `Summary: ${sub.summary}\n\n` : "")}${String(sub.markdown).slice(0, 6000)}`);
      }
    }

    const branding = home.branding || {};
    const homeMarkdown = String(home.markdown || "").slice(0, 12000);
    const homeSummary = home.summary || "";
    const metaTitle = home.metadata?.title || "";
    const metaDesc = home.metadata?.description || "";

    // ─── 4) Ask Gemini 2.5 Pro for a comprehensive brand profile ───────────
    const systemPrompt = `You are a brand strategist analysing a company's public website to build a complete brand intelligence profile for an experiential design agency.

Your job: extract or infer a clear, actionable brand profile that a designer can use to craft on-brand spatial experiences. If a field is genuinely unknown, return an empty string or empty array — never invent specifics. Be concise and write in the brand's own voice where possible.`;

    const userPrompt = `CLIENT: ${clientName || "(unknown)"}
INDUSTRY: ${industry || "(unknown)"}
WEBSITE: ${baseUrl}

—— HOMEPAGE METADATA ——
Title: ${metaTitle}
Description: ${metaDesc}

—— HOMEPAGE AI SUMMARY ——
${homeSummary || "(none)"}

—— HOMEPAGE CONTENT (truncated) ——
${homeMarkdown}

—— BRAND SUBPAGES ——
${subPageContent.join("\n\n---\n\n") || "(none found)"}

—— FIRECRAWL BRANDING SIGNALS ——
${JSON.stringify(branding, null, 2).slice(0, 3000)}

Extract the brand profile using the build_brand_profile tool.`;

    const tool = {
      type: "function",
      function: {
        name: "build_brand_profile",
        description: "Extract a comprehensive brand profile from the supplied website content.",
        parameters: {
          type: "object",
          properties: {
            mission: { type: "string", description: "The brand's mission statement (one sentence)." },
            vision: { type: "string", description: "The brand's vision for the future (one sentence)." },
            values: { type: "array", items: { type: "string" }, description: "Core brand values (3-7 short phrases)." },
            personality: { type: "array", items: { type: "string" }, description: "Brand personality adjectives (4-7)." },
            toneOfVoice: { type: "string", description: "How the brand speaks: 1-3 sentences describing voice and tone." },
            sentiment: { type: "string", description: "Overall emotional sentiment of the brand (e.g. optimistic, bold, calm-and-considered)." },
            targetAudience: { type: "string", description: "Primary target audience description." },
            messagingPillars: { type: "array", items: { type: "string" }, description: "Top 3-5 messaging pillars / themes." },
            taglines: { type: "array", items: { type: "string" }, description: "Known taglines or recurring phrases observed on the site." },
            dos: { type: "array", items: { type: "string" }, description: "On-brand do's (specific, actionable)." },
            donts: { type: "array", items: { type: "string" }, description: "Off-brand don'ts (specific, actionable)." },
            competitors: { type: "array", items: { type: "string" }, description: "Likely competitors (if mentioned or obvious by category)." },
            colors: {
              type: "object",
              properties: {
                primary: { type: "array", items: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" }, usage: { type: "string" } } } },
                secondary: { type: "array", items: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" }, usage: { type: "string" } } } },
                accent: { type: "array", items: { type: "object", properties: { hex: { type: "string" }, name: { type: "string" }, usage: { type: "string" } } } },
              },
            },
            typography: {
              type: "object",
              properties: {
                primaryTypeface: { type: "string" },
                secondaryTypeface: { type: "string" },
                usageRules: { type: "string" },
              },
            },
            photographyStyle: {
              type: "object",
              properties: {
                style: { type: "string", description: "Description of photography/imagery style." },
                dos: { type: "array", items: { type: "string" } },
                donts: { type: "array", items: { type: "string" } },
              },
            },
            logoUrl: { type: "string", description: "Best primary logo URL observed." },
          },
          required: ["mission", "values", "personality", "toneOfVoice", "messagingPillars"],
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
      toolChoice: { type: "function", function: { name: "build_brand_profile" } },
      temperature: 0.3,
      maxTokens: 4096,
    });

    const profile = ai.toolCalls?.[0]?.arguments || {};

    // Merge branding signals (Firecrawl) into colors/typography if Gemini left blanks
    const fcColors = branding.colors || {};
    if (!profile.colors) profile.colors = { primary: [], secondary: [], accent: [] };
    profile.colors.primary = profile.colors.primary || [];
    profile.colors.secondary = profile.colors.secondary || [];
    profile.colors.accent = profile.colors.accent || [];

    if (profile.colors.primary.length === 0 && fcColors.primary) {
      profile.colors.primary.push({ hex: fcColors.primary, name: "Primary", usage: "Detected from website" });
    }
    if (profile.colors.secondary.length === 0 && fcColors.secondary) {
      profile.colors.secondary.push({ hex: fcColors.secondary, name: "Secondary", usage: "Detected from website" });
    }
    if (profile.colors.accent.length === 0 && fcColors.accent) {
      profile.colors.accent.push({ hex: fcColors.accent, name: "Accent", usage: "Detected from website" });
    }

    if (!profile.typography) profile.typography = {};
    if (!profile.typography.primaryTypeface && branding.typography?.fontFamilies?.primary) {
      profile.typography.primaryTypeface = branding.typography.fontFamilies.primary;
    }
    if (!profile.typography.secondaryTypeface && branding.typography?.fontFamilies?.heading) {
      profile.typography.secondaryTypeface = branding.typography.fontFamilies.heading;
    }
    if (!profile.logoUrl && branding.images?.logo) {
      profile.logoUrl = branding.images.logo;
    }

    // ─── 5) Convert profile into brand_intelligence entries (pending review) ──
    const entries: Array<{ category: string; title: string; content: string; tags: string[] }> = [];

    const push = (
      category: string,
      title: string,
      content: string,
      tags: string[],
    ) => {
      if (content && content.trim().length > 0) {
        entries.push({ category, title, content: content.trim(), tags });
      }
    };

    if (profile.mission) push("strategic_voice", "Mission", profile.mission, ["mission", "purpose"]);
    if (profile.vision) push("strategic_voice", "Vision", profile.vision, ["vision", "future"]);
    if (profile.values?.length) push("strategic_voice", "Core Values", profile.values.join("\n• "), ["values"]);
    if (profile.personality?.length) push("strategic_voice", "Brand Personality", profile.personality.join(", "), ["personality"]);
    if (profile.toneOfVoice) push("strategic_voice", "Tone of Voice", profile.toneOfVoice, ["voice", "tone"]);
    if (profile.sentiment) push("strategic_voice", "Brand Sentiment", profile.sentiment, ["sentiment", "emotion"]);
    if (profile.targetAudience) push("strategic_voice", "Target Audience", profile.targetAudience, ["audience"]);
    if (profile.messagingPillars?.length) push("strategic_voice", "Messaging Pillars", profile.messagingPillars.map((p: string) => `• ${p}`).join("\n"), ["messaging"]);
    if (profile.taglines?.length) push("strategic_voice", "Taglines", profile.taglines.join("\n"), ["taglines"]);
    if (profile.competitors?.length) push("strategic_voice", "Competitors", profile.competitors.join(", "), ["competitors"]);

    // Visual identity
    const allColors = [
      ...(profile.colors?.primary || []),
      ...(profile.colors?.secondary || []),
      ...(profile.colors?.accent || []),
    ].filter((c: any) => c?.hex);
    if (allColors.length) {
      const colorLines = allColors.map((c: any) => `${c.hex}${c.name ? ` — ${c.name}` : ""}${c.usage ? ` (${c.usage})` : ""}`).join("\n");
      push("visual_identity", "Brand Colors", colorLines, ["colors"]);
    }
    if (profile.typography?.primaryTypeface || profile.typography?.secondaryTypeface) {
      const lines = [
        profile.typography.primaryTypeface && `Primary: ${profile.typography.primaryTypeface}`,
        profile.typography.secondaryTypeface && `Secondary: ${profile.typography.secondaryTypeface}`,
        profile.typography.usageRules && `Usage: ${profile.typography.usageRules}`,
      ].filter(Boolean).join("\n");
      push("visual_identity", "Typography", lines, ["typography", "fonts"]);
    }
    if (profile.logoUrl) {
      push("visual_identity", "Logo URL", `Detected logo: ${profile.logoUrl}`, ["logo"]);
    }
    if (profile.photographyStyle?.style) {
      push("visual_identity", "Photography Style", profile.photographyStyle.style, ["photography", "imagery"]);
    }

    // Process / dos & don'ts
    if (profile.dos?.length) push("process_procedure", "Brand Do's", profile.dos.map((d: string) => `• ${d}`).join("\n"), ["dos"]);
    if (profile.donts?.length) push("process_procedure", "Brand Don'ts", profile.donts.map((d: string) => `• ${d}`).join("\n"), ["donts"]);

    // ─── 6) Build a structured brand_guidelines payload ────────────────────
    const guidelines = {
      colorSystem: {
        primary: profile.colors?.primary || [],
        secondary: profile.colors?.secondary || [],
        accent: profile.colors?.accent || [],
        forbidden: [],
      },
      typography: {
        primaryTypeface: profile.typography?.primaryTypeface || "",
        secondaryTypeface: profile.typography?.secondaryTypeface || "",
        sizeScale: "",
        usageRules: profile.typography?.usageRules || "",
      },
      logoRules: {
        clearSpace: "",
        minSize: "",
        forbiddenTreatments: [],
        usageNotes: profile.logoUrl ? `Primary logo: ${profile.logoUrl}` : "",
      },
      photographyStyle: {
        style: profile.photographyStyle?.style || "",
        dos: profile.photographyStyle?.dos || profile.dos || [],
        donts: profile.photographyStyle?.donts || profile.donts || [],
      },
      toneOfVoice: {
        description: profile.toneOfVoice || "",
        messagingPillars: profile.messagingPillars || [],
        taglines: profile.taglines || [],
      },
      materialsFinishes: {
        preferred: [],
        forbidden: [],
        finishNotes: "",
      },
    };

    const primaryHex = allColors[0]?.hex || fcColors.primary || "";
    const secondaryHex = allColors[1]?.hex || fcColors.secondary || "";

    console.log(`[deep-dive] Done — ${entries.length} entries, logo=${profile.logoUrl ? "yes" : "no"}, colors=${allColors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        entries,
        guidelines,
        logoUrl: profile.logoUrl || branding.images?.logo || "",
        colors: { primary: primaryHex, secondary: secondaryHex },
        profile,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[deep-dive] error:", error);
    const msg = error instanceof Error ? error.message : "Deep dive failed";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
