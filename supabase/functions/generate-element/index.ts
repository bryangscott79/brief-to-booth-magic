import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ELEMENT_SYSTEM_PROMPTS: Record<string, string> = {
  bigIdea: `You are an elite experiential marketing strategist. Generate a comprehensive "Big Idea" for a trade show booth. Include:
- A bold, memorable headline (tagline)
- A supporting subheadline
- A detailed strategic narrative (3-4 paragraphs) explaining the concept
- Strategic positioning statement
- Key differentiators (3-5 bullet points with explanations)
- Core tension the concept explores
- Brief alignment notes showing how this meets the RFP criteria
- Industry trend context: reference current experiential marketing trends (immersive tech, sustainability, AI personalization, etc.)
- Competitive landscape analysis
- Emotional resonance strategy

Make it feel like a pitch deck slide — bold, confident, and strategically grounded.`,

  experienceFramework: `You are a world-class experience designer for trade shows. Generate an exhaustive "Experience Framework" including:
- Concept description (2-3 paragraphs, vivid and evocative)
- 5-7 design principles, each with name, detailed description, and brief reference
- Complete visitor journey with 5-6 stages, each with description, touchpoints, emotional arc, and timing
- Audience routing for each persona with detailed pathways, timing, key touchpoints, and engagement goals
- Sensory design notes (lighting, sound, scent, texture)
- Accessibility considerations
- Staff choreography and role descriptions
- Technology integration points
- Measurement/KPI framework for experience success

Reference current industry trends in experiential design: multi-sensory environments, personalized journeys, phygital experiences, data-driven engagement.`,

  interactiveMechanics: `You are a creative technologist specializing in interactive installations. Generate detailed "Interactive Mechanics" including:
- Hero installation with: evocative name, high-concept description (2 paragraphs), physical form details (structure, dimensions, materials, visual language), complete interaction model (5+ steps with user actions and system responses), technical specifications, and audience value per persona
- 3-4 secondary interactive elements with names, types, descriptions, locations, purposes, and technical notes
- Technology stack recommendations
- Content engine description
- Idle state behavior
- Failure mode handling
- Maintenance requirements
- Engagement metrics to track
- Reference cutting-edge interactive technology trends: spatial computing, generative AI, real-time data visualization, gesture recognition, AR/MR overlays.`,

  digitalStorytelling: `You are a content strategist for immersive brand experiences. Generate comprehensive "Digital Storytelling" strategy including:
- Content philosophy (2 paragraphs)
- 3-4 audience tracks with: track name, target audience, format, content focus, tone, delivery method, key messages, and sample content outline
- 6-8 content modules with: title, description, duration, format, reusability notes, and production complexity
- Production notes: modularity approach, refresh cycle, guided vs self-directed ratio
- Content distribution strategy across touchpoints
- Social media integration and amplification strategy
- Post-event content repurposing plan
- Measurement framework for content effectiveness
- Reference trends: short-form video, interactive storytelling, AI-personalized content, user-generated content integration.`,

  humanConnection: `You are a hospitality and meeting design expert for trade shows. Generate exhaustive "Human Connection Zones" strategy including:
- Detailed zone configurations for each footprint size with: zone names, capacity, rich descriptions, design features, furniture specs, purpose, and atmosphere notes
- Operational plan: booking system, content support, transition design, staffing model
- Meeting type taxonomy: executive briefings, technical deep-dives, partner discussions, press meetings
- Hospitality details: F&B recommendations, ambient design, comfort features
- Privacy gradient design (open → semi-private → private)
- Technology in meeting spaces: presentation tools, note-taking, follow-up automation
- Scaling notes with specific recommendations per footprint
- Reference trends: biophilic design, wellness spaces, quiet zones, networking technology.`,

  adjacentActivations: `You are an event strategist specializing in off-booth activations. Generate comprehensive "Adjacent Activations" including:
- 3-4 detailed activations with: name, type (primary/secondary), format description, capacity, venue type, venue recommendations per show, program format, atmosphere description, takeaway items, brief alignment, and estimated budget
- Competitive positioning strategy (2 paragraphs)
- Timing and scheduling recommendations
- Guest list curation strategy
- Content and programming details for each activation
- Sponsorship and partnership opportunities
- Social media and PR integration
- Success metrics per activation
- Logistics and production notes
- Reference trends: exclusive experiences, thought leadership forums, wellness activations, cultural immersion events.`,

  spatialStrategy: `You are an exhibit designer and spatial strategist. Generate detailed "Spatial Strategy" with MATHEMATICALLY CORRECT zone positions.

CRITICAL POSITIONING RULES:
1. All position values (x, y, width, height) must be PERCENTAGES from 0-100
2. x = 0 means left edge, x = 100 means right edge
3. y = 0 means FRONT (aisle side), y = 100 means BACK (rear wall)
4. For EACH zone: x + width <= 100 AND y + height <= 100 (zones must fit within booth)
5. Zones should NOT overlap significantly
6. All zone percentages should sum to approximately 85-100% (leaving room for circulation)
7. sqft = (width/100) * (height/100) * totalSqft — calculate this correctly!

STANDARD ZONE POSITIONING GUIDE (for reference):
| Zone Type      | Typical x  | Typical y  | Typical w  | Typical h  |
|----------------|------------|------------|------------|------------|
| Reception      | 30-40      | 0-5        | 30-40      | 12-18      |
| Hero/Center    | 20-30      | 30-45      | 40-55      | 30-40      |
| Storytelling   | 0-5        | 20-35      | 25-30      | 40-50      |
| Lounge/Meeting | 65-75      | 25-40      | 25-35      | 40-50      |
| Demo Stations  | 0-10       | 0-10       | 20-25      | 20-25      |
| Back of House  | 75-85      | 75-85      | 15-25      | 15-25      |

Include:
- Zone configurations for EACH footprint in the brief with: zone IDs, names, percentages, square footage, hex color codes, position coordinates, requirements, adjacencies, and detailed notes
- Scaling strategy: what scales down, what gets eliminated, what stays proportional, concept integrity statement
- Materials and mood board: 6-8 materials with use case and feel description
- Traffic flow patterns with from/to/label for 6+ pathways
- Sightline analysis
- Lighting zones and strategy
- ADA compliance notes
- Reference trends: modular systems, sustainable materials, LED environments, flexible configurations.`,

  budgetLogic: `You are a trade show budget strategist and financial analyst. Generate comprehensive "Budget Logic" including:
- Total per-show budget with detailed allocation across 8-10 categories (percentage, amount, detailed description)
- Amortization schedule across 3-5 shows showing cost reduction through reuse
- 5-7 risk factors with impact description and severity level
- ROI framework: cost per lead, cost per meeting, brand impression value
- Value engineering recommendations
- Vendor strategy notes
- Payment milestone schedule
- Insurance and contingency planning
- Cost comparison vs industry benchmarks
- Reference trends: sustainable ROI, digital-first cost optimization, modular investment strategies.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { elementType, briefData, existingData, feedback, knowledgeBaseContent, companyProfile, showCosts, upstreamContext } = await req.json();

    const validTypes = ["bigIdea", "experienceFramework", "interactiveMechanics", "digitalStorytelling", "humanConnection", "adjacentActivations", "spatialStrategy", "budgetLogic"];
    if (!elementType || !validTypes.includes(elementType)) {
      return new Response(JSON.stringify({ error: `Invalid elementType. Must be one of: ${validTypes.join(", ")}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!briefData || typeof briefData !== "object") {
      return new Response(JSON.stringify({ error: "briefData is required and must be an object" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = ELEMENT_SYSTEM_PROMPTS[elementType];
    if (!systemPrompt) throw new Error(`Unknown element type: ${elementType}`);

    let userPrompt = `Here is the creative brief data:\n\n${JSON.stringify(briefData, null, 2)}`;

    // PHASE 2: Inject upstream element context for cascading generation
    if (upstreamContext && typeof upstreamContext === "object" && Object.keys(upstreamContext).length > 0) {
      userPrompt += `\n\n═══════════════════════════════════════
UPSTREAM CONTEXT (from already-generated elements)
═══════════════════════════════════════
The following elements have already been generated for this project. Your output MUST be consistent with them.
Do NOT contradict the Big Idea headline, spatial zone allocations, budget parameters, or experience framework design principles.\n`;

      for (const [key, value] of Object.entries(upstreamContext)) {
        if (key === "instruction") {
          userPrompt += `\n${value}\n`;
        } else if (value && typeof value === "object") {
          userPrompt += `\n--- ${key} ---\n${JSON.stringify(value, null, 2)}\n`;
        }
      }

      userPrompt += `\n═══════════════════════════════════════
END UPSTREAM CONTEXT
═══════════════════════════════════════\n`;
    }

    // For spatial strategy, add explicit dimension calculations
    if (elementType === "spatialStrategy" && briefData?.spatial?.footprints) {
      userPrompt += `\n\n--- FOOTPRINT CALCULATIONS (use these exact values) ---\n`;
      for (const fp of briefData.spatial.footprints) {
        const match = fp.size?.match(/(\d+)\s*[x×X]\s*(\d+)/);
        if (match) {
          const w = parseInt(match[1], 10);
          const d = parseInt(match[2], 10);
          const sqft = w * d;
          userPrompt += `\nFootprint: ${fp.size}
- Width: ${w} feet
- Depth: ${d} feet  
- Total: ${sqft} sq ft
- For a zone that is 30% wide and 40% deep: sqft = ${sqft} * 0.30 * 0.40 = ${Math.round(sqft * 0.30 * 0.40)} sq ft
`;
        }
      }
      userPrompt += `--- END FOOTPRINT CALCULATIONS ---\n`;
    }

    // Include knowledge base content if available
    if (knowledgeBaseContent && knowledgeBaseContent.length > 0) {
      userPrompt += `\n\n--- KNOWLEDGE BASE (reference materials, past projects, inspiration) ---\n`;
      for (const kb of knowledgeBaseContent) {
        userPrompt += `\n### ${kb.fileName}\n${kb.content}\n`;
      }
      userPrompt += `\n--- END KNOWLEDGE BASE ---\nUse the knowledge base content above to inform and enrich your response.`;
    }

    // Include company profile if available
    if (companyProfile) {
      userPrompt += `\n\n--- COMPANY PROFILE ---\n${JSON.stringify(companyProfile, null, 2)}\n--- END COMPANY PROFILE ---\n`;
    }

    // Include show cost data if available
    if (showCosts && showCosts.length > 0) {
      userPrompt += `\n\n--- SHOW COST DATABASE ---\n${JSON.stringify(showCosts, null, 2)}\n--- END SHOW COST DATABASE ---\n`;
    }

    if (existingData) {
      userPrompt += `\n\nHere is the current content that needs to be improved or regenerated:\n${JSON.stringify(existingData, null, 2)}`;
    }

    if (feedback) {
      userPrompt += `\n\nUser feedback for this regeneration:\n${feedback}`;
    }

    if (existingData || feedback) {
      userPrompt += `\n\nIMPORTANT: This is a REGENERATION request. Create a completely NEW and DIFFERENT concept.`;
    }

    // Special instructions for spatial strategy
    if (elementType === "spatialStrategy") {
      userPrompt += `\n\nCRITICAL SPATIAL REQUIREMENTS:
1. Position values are PERCENTAGES (0-100), NOT feet
2. x=0 is LEFT edge, y=0 is FRONT (aisle side)
3. Every zone must satisfy: x + width <= 100 AND y + height <= 100
4. Calculate sqft as: (width/100) * (height/100) * totalSqft
5. Zones should not overlap
6. Include a config for EACH footprint mentioned in the brief
7. Use descriptive zone IDs like "hero", "lounge", "storytelling", "reception", "demo", "service"
8. Color codes should be hex format like "#0047AB"`;
    }

    userPrompt += `\n\nGenerate exhaustive, presentation-quality content. Be specific, bold, and strategic. You MUST use the provided tool/function to return your response.`;

    // Define the tool schema for structured output
    const toolSchema = getToolSchema(elementType);

    const requestBody: any = {
      model: "google/gemini-2.5-pro",
      temperature: existingData || feedback ? 1.2 : 0.9,
      messages: [
        { role: "system", content: systemPrompt + "\n\nIMPORTANT: You MUST call the provided function tool to return your response. Do not return plain text." },
        { role: "user", content: userPrompt },
      ],
      tools: [toolSchema],
      tool_choice: { type: "function", function: { name: `generate_${elementType}` } },
    };

    console.log("Calling AI for element:", elementType);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response structure:", JSON.stringify({
      hasToolCalls: !!data.choices?.[0]?.message?.tool_calls,
      hasContent: !!data.choices?.[0]?.message?.content,
      finishReason: data.choices?.[0]?.finish_reason,
    }));

    // Extract the tool call response
    const toolCalls = data.choices?.[0]?.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      let parsedData;
      
      try {
        parsedData = typeof toolCall.function.arguments === "string" 
          ? JSON.parse(toolCall.function.arguments) 
          : toolCall.function.arguments;
      } catch (parseError) {
        console.error("Failed to parse tool arguments:", parseError);
        throw new Error("Failed to parse AI response");
      }

      // Post-process spatial strategy to validate/fix zone positions
      if (elementType === "spatialStrategy" && parsedData.configs) {
        parsedData.configs = parsedData.configs.map((config: any) => {
          const totalSqft = config.totalSqft || 900;
          
          if (config.zones) {
            config.zones = config.zones.map((zone: any, index: number) => {
              const pos = zone.position || { x: 0, y: 0, width: 25, height: 25 };
              
              // Normalize positions to 0-100 range if they appear to be ratios
              let x = pos.x, y = pos.y, w = pos.width, h = pos.height;
              
              // Detect if values are in 0-1 ratio format
              if (x <= 1 && y <= 1 && w <= 1 && h <= 1) {
                x = x * 100;
                y = y * 100;
                w = w * 100;
                h = h * 100;
              }
              
              // Clamp to valid bounds
              w = Math.max(5, Math.min(w, 100));
              h = Math.max(5, Math.min(h, 100));
              x = Math.max(0, Math.min(x, 100 - w));
              y = Math.max(0, Math.min(y, 100 - h));
              
              // Recalculate sqft based on actual dimensions
              const calculatedSqft = Math.round((w / 100) * (h / 100) * totalSqft);
              const calculatedPercentage = Math.round((w / 100) * (h / 100) * 100);
              
              return {
                ...zone,
                id: zone.id || `zone_${index}`,
                position: { x, y, width: w, height: h },
                sqft: zone.sqft && Math.abs(zone.sqft - calculatedSqft) < 50 ? zone.sqft : calculatedSqft,
                percentage: zone.percentage && Math.abs(zone.percentage - calculatedPercentage) < 10 ? zone.percentage : calculatedPercentage,
                colorCode: zone.colorCode || getDefaultColor(index),
              };
            });
          }
          
          return config;
        });
      }

      return new Response(JSON.stringify({ data: parsedData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try to extract content from message
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      console.log("Falling back to content parsing, content length:", content.length);
      // Try to parse as JSON
      let jsonStr = content;
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      try {
        const parsed = JSON.parse(jsonStr);
        return new Response(JSON.stringify({ data: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        console.error("Failed to parse AI content as JSON");
        return new Response(JSON.stringify({ data: { rawContent: content } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.error("No tool calls or content in response");
    return new Response(JSON.stringify({ error: "AI returned empty response. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-element error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getDefaultColor(index: number): string {
  const colors = ['#0047AB', '#4682B4', '#2F4F4F', '#DAA520', '#8B4513', '#556B2F', '#800080', '#CD853F'];
  return colors[index % colors.length];
}

function getToolSchema(elementType: string) {
  const schemas: Record<string, any> = {
    bigIdea: {
      type: "function",
      function: {
        name: "generate_bigIdea",
        description: "Generate a comprehensive Big Idea for a trade show booth",
        parameters: {
          type: "object",
          properties: {
            headline: { type: "string", description: "Bold, memorable tagline" },
            subheadline: { type: "string", description: "Supporting statement" },
            narrative: { type: "string", description: "3-4 paragraph strategic narrative" },
            strategicPosition: { type: "string", description: "Positioning statement" },
            differentiation: { type: "string", description: "What makes this unique" },
            coreTension: { type: "string", description: "The tension the concept explores" },
            briefAlignment: { type: "array", items: { type: "string" }, description: "How this meets RFP criteria" },
            industryTrends: { type: "array", items: { type: "object", properties: { trend: { type: "string" }, relevance: { type: "string" } }, required: ["trend", "relevance"] } },
            competitiveAnalysis: { type: "string", description: "How this positions against competitors" },
            emotionalResonance: { type: "string", description: "Emotional strategy description" },
          },
          required: ["headline", "subheadline", "narrative", "strategicPosition", "differentiation", "coreTension", "briefAlignment"],
        },
      },
    },
    experienceFramework: {
      type: "function",
      function: {
        name: "generate_experienceFramework",
        description: "Generate a comprehensive Experience Framework",
        parameters: {
          type: "object",
          properties: {
            conceptDescription: { type: "string", description: "2-3 paragraph concept description" },
            designPrinciples: { type: "array", items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, briefReference: { type: "string" } }, required: ["name", "description", "briefReference"] } },
            visitorJourney: { type: "array", items: { type: "object", properties: { stage: { type: "string" }, description: { type: "string" }, touchpoints: { type: "array", items: { type: "string" } }, emotionalArc: { type: "string" }, timing: { type: "string" }, colorCode: { type: "string" } }, required: ["stage", "description", "touchpoints"] } },
            audienceRouting: { type: "array", items: { type: "object", properties: { persona: { type: "string" }, pathway: { type: "array", items: { type: "string" } }, timing: { type: "string" }, keyTouchpoints: { type: "array", items: { type: "string" } }, engagementGoal: { type: "string" } }, required: ["persona", "pathway", "timing", "keyTouchpoints"] } },
            sensoryDesign: { type: "object", properties: { lighting: { type: "string" }, sound: { type: "string" }, scent: { type: "string" }, texture: { type: "string" } } },
            staffChoreography: { type: "array", items: { type: "object", properties: { role: { type: "string" }, responsibility: { type: "string" }, location: { type: "string" } }, required: ["role", "responsibility"] } },
            kpiFramework: { type: "array", items: { type: "object", properties: { metric: { type: "string" }, target: { type: "string" }, method: { type: "string" } }, required: ["metric", "target"] } },
          },
          required: ["conceptDescription", "designPrinciples", "visitorJourney", "audienceRouting"],
        },
      },
    },
    interactiveMechanics: {
      type: "function",
      function: {
        name: "generate_interactiveMechanics",
        description: "Generate Interactive Mechanics for the booth",
        parameters: {
          type: "object",
          properties: {
            hero: {
              type: "object",
              properties: {
                name: { type: "string" },
                concept: { type: "string" },
                physicalForm: { type: "object", properties: { structure: { type: "string" }, dimensions: { type: "string" }, materials: { type: "array", items: { type: "string" } }, visualLanguage: { type: "string" } }, required: ["structure", "dimensions", "materials", "visualLanguage"] },
                interactionModel: { type: "array", items: { type: "object", properties: { step: { type: "number" }, name: { type: "string" }, description: { type: "string" }, userAction: { type: "string" }, systemResponse: { type: "string" } }, required: ["step", "name", "description", "userAction", "systemResponse"] } },
                technicalSpecs: { type: "object", properties: { displayTechnology: { type: "string" }, contentEngine: { type: "string" }, inputMethod: { type: "string" }, simultaneousUsers: { type: "string" }, cycleDuration: { type: "string" }, idleState: { type: "string" } }, required: ["displayTechnology", "contentEngine", "inputMethod"] },
                audienceValue: { type: "object", properties: { forExecutives: { type: "string" }, forTechnical: { type: "string" }, forPartners: { type: "string" } } },
                failureModes: { type: "string" },
                maintenanceNotes: { type: "string" },
              },
              required: ["name", "concept", "physicalForm", "interactionModel", "technicalSpecs"],
            },
            secondary: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, description: { type: "string" }, location: { type: "string" }, purpose: { type: "string" }, technicalNotes: { type: "string" } }, required: ["name", "type", "description", "location", "purpose"] } },
            technologyStack: { type: "array", items: { type: "string" } },
            engagementMetrics: { type: "array", items: { type: "object", properties: { metric: { type: "string" }, method: { type: "string" } }, required: ["metric", "method"] } },
          },
          required: ["hero", "secondary"],
        },
      },
    },
    digitalStorytelling: {
      type: "function",
      function: {
        name: "generate_digitalStorytelling",
        description: "Generate Digital Storytelling strategy",
        parameters: {
          type: "object",
          properties: {
            philosophy: { type: "string", description: "Content philosophy, 2 paragraphs" },
            audienceTracks: { type: "array", items: { type: "object", properties: { trackName: { type: "string" }, targetAudience: { type: "string" }, format: { type: "string" }, contentFocus: { type: "string" }, tone: { type: "string" }, deliveryMethod: { type: "string" }, keyMessages: { type: "array", items: { type: "string" } }, sampleOutline: { type: "string" } }, required: ["trackName", "targetAudience", "format", "contentFocus", "tone", "deliveryMethod"] } },
            contentModules: { type: "array", items: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, duration: { type: "string" }, format: { type: "string" }, reusability: { type: "string" }, complexity: { type: "string" } }, required: ["title", "description", "duration"] } },
            productionNotes: { type: "object", properties: { modularity: { type: "string" }, refreshCycle: { type: "string" }, guidedVsSelfDirected: { type: "string" } } },
            socialStrategy: { type: "string" },
            postEventPlan: { type: "string" },
            measurementFramework: { type: "array", items: { type: "object", properties: { metric: { type: "string" }, target: { type: "string" } }, required: ["metric"] } },
          },
          required: ["philosophy", "audienceTracks", "contentModules"],
        },
      },
    },
    humanConnection: {
      type: "function",
      function: {
        name: "generate_humanConnection",
        description: "Generate Human Connection Zones strategy",
        parameters: {
          type: "object",
          properties: {
            configs: { type: "array", items: { type: "object", properties: { footprintSize: { type: "string" }, zones: { type: "array", items: { type: "object", properties: { name: { type: "string" }, capacity: { type: "string" }, description: { type: "string" }, designFeatures: { type: "array", items: { type: "string" } }, purpose: { type: "string" }, furniture: { type: "string" }, atmosphere: { type: "string" } }, required: ["name", "capacity", "description", "designFeatures", "purpose"] } } }, required: ["footprintSize", "zones"] } },
            operational: { type: "object", properties: { booking: { type: "string" }, contentSupport: { type: "string" }, transitionDesign: { type: "string" }, staffingModel: { type: "string" } } },
            meetingTypes: { type: "array", items: { type: "object", properties: { type: { type: "string" }, description: { type: "string" }, duration: { type: "string" }, requirements: { type: "string" } }, required: ["type", "description"] } },
            hospitalityDetails: { type: "object", properties: { foodAndBeverage: { type: "string" }, ambientDesign: { type: "string" }, comfortFeatures: { type: "string" } } },
            scalingNotes: { type: "string" },
          },
          required: ["configs", "operational", "scalingNotes"],
        },
      },
    },
    adjacentActivations: {
      type: "function",
      function: {
        name: "generate_adjacentActivations",
        description: "Generate Adjacent Activations strategy",
        parameters: {
          type: "object",
          properties: {
            activations: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: ["primary", "secondary"] }, format: { type: "string" }, capacity: { type: "string" }, venueType: { type: "string" }, venueRecommendations: { type: "array", items: { type: "object", properties: { show: { type: "string" }, venues: { type: "array", items: { type: "string" } } }, required: ["show", "venues"] } }, programFormat: { type: "string" }, atmosphere: { type: "string" }, takeaway: { type: "string" }, briefAlignment: { type: "array", items: { type: "string" } }, estimatedBudget: { type: "string" }, contentProgram: { type: "string" } }, required: ["name", "type", "format", "capacity", "venueType", "programFormat", "atmosphere"] } },
            competitivePositioning: { type: "string" },
            timingStrategy: { type: "string" },
            guestCuration: { type: "string" },
            socialIntegration: { type: "string" },
            successMetrics: { type: "array", items: { type: "object", properties: { metric: { type: "string" }, target: { type: "string" } }, required: ["metric"] } },
          },
          required: ["activations", "competitivePositioning"],
        },
      },
    },
    spatialStrategy: {
      type: "function",
      function: {
        name: "generate_spatialStrategy",
        description: `Generate Spatial Strategy with MATHEMATICALLY CORRECT zone positions.

RULES:
- Position values (x, y, width, height) are PERCENTAGES (0-100)
- x=0 is left edge, y=0 is front/aisle edge
- For each zone: x + width <= 100 AND y + height <= 100
- sqft = (width/100) * (height/100) * totalSqft
- Zones should not overlap`,
        parameters: {
          type: "object",
          properties: {
            configs: { 
              type: "array", 
              items: { 
                type: "object", 
                properties: { 
                  footprintSize: { type: "string", description: "e.g., '30x30'" }, 
                  totalSqft: { type: "number", description: "Width × Depth in sq ft" }, 
                  zones: { 
                    type: "array", 
                    items: { 
                      type: "object", 
                      properties: { 
                        id: { type: "string", description: "Zone ID: hero, storytelling, lounge, reception, demo, service" }, 
                        name: { type: "string", description: "Display name for the zone" }, 
                        percentage: { type: "number", description: "Percentage of booth (5-40 typical)", minimum: 5, maximum: 50 }, 
                        sqft: { type: "number", description: "(width/100)*(height/100)*totalSqft" }, 
                        colorCode: { type: "string", description: "Hex color like #0047AB" }, 
                        position: { 
                          type: "object", 
                          properties: { 
                            x: { type: "number", description: "Left edge %, 0-95", minimum: 0, maximum: 95 }, 
                            y: { type: "number", description: "Top edge % (0=aisle), 0-95", minimum: 0, maximum: 95 }, 
                            width: { type: "number", description: "Width %, 5-60", minimum: 5, maximum: 60 }, 
                            height: { type: "number", description: "Depth %, 5-60", minimum: 5, maximum: 60 } 
                          }, 
                          required: ["x", "y", "width", "height"] 
                        }, 
                        requirements: { type: "array", items: { type: "string" } }, 
                        adjacencies: { type: "array", items: { type: "string" }, description: "IDs of adjacent zones" }, 
                        notes: { type: "string" } 
                      }, 
                      required: ["id", "name", "percentage", "sqft", "colorCode", "position", "requirements"] 
                    } 
                  } 
                }, 
                required: ["footprintSize", "totalSqft", "zones"] 
              } 
            },
            scalingStrategy: { 
              type: "object", 
              properties: { 
                whatScalesDown: { type: "array", items: { type: "string" } }, 
                whatEliminates: { type: "array", items: { type: "string" } }, 
                whatStaysProportional: { type: "array", items: { type: "string" } }, 
                conceptIntegrity: { type: "string" } 
              } 
            },
            materialsAndMood: { 
              type: "array", 
              items: { 
                type: "object", 
                properties: { 
                  material: { type: "string" }, 
                  use: { type: "string" }, 
                  feel: { type: "string" } 
                }, 
                required: ["material", "use", "feel"] 
              } 
            },
            trafficFlow: { 
              type: "array", 
              items: { 
                type: "object", 
                properties: { 
                  from: { type: "string" }, 
                  to: { type: "string" }, 
                  label: { type: "string" } 
                }, 
                required: ["from", "to", "label"] 
              } 
            },
            lightingStrategy: { type: "string" },
            adaCompliance: { type: "string" },
            riggingNotes: { type: "string" },
          },
          required: ["configs", "scalingStrategy", "materialsAndMood", "trafficFlow"],
        },
      },
    },
    budgetLogic: {
      type: "function",
      function: {
        name: "generate_budgetLogic",
        description: "Generate Budget Logic and financial analysis",
        parameters: {
          type: "object",
          properties: {
            totalPerShow: { type: "number" },
            allocation: { type: "array", items: { type: "object", properties: { category: { type: "string" }, percentage: { type: "number" }, amount: { type: "number" }, description: { type: "string" } }, required: ["category", "percentage", "amount", "description"] } },
            amortization: { type: "array", items: { type: "object", properties: { showNumber: { type: "number" }, estimatedCost: { type: "number" }, savings: { type: "string" } }, required: ["showNumber", "estimatedCost", "savings"] } },
            riskFactors: { type: "array", items: { type: "object", properties: { factor: { type: "string" }, impact: { type: "string" }, level: { type: "string", enum: ["high", "medium", "low"] } }, required: ["factor", "impact", "level"] } },
            roiFramework: { type: "object", properties: { costPerLead: { type: "string" }, costPerMeeting: { type: "string" }, brandImpressionValue: { type: "string" } } },
            valueEngineering: { type: "array", items: { type: "string" } },
            vendorStrategy: { type: "string" },
            paymentMilestones: { type: "array", items: { type: "object", properties: { milestone: { type: "string" }, percentage: { type: "number" }, timing: { type: "string" } }, required: ["milestone", "percentage", "timing"] } },
            industryBenchmarks: { type: "string" },
          },
          required: ["totalPerShow", "allocation", "amortization", "riskFactors"],
        },
      },
    },
  };

  return schemas[elementType];
}
