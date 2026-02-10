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

  spatialStrategy: `You are an exhibit designer and spatial strategist. Generate detailed "Spatial Strategy" including:
- Zone configurations for each footprint with: zone IDs, names, percentages, square footage, color codes, position coordinates (x,y,width,height as percentages), requirements, adjacencies, and detailed notes
- Scaling strategy: what scales down, what gets eliminated, what stays proportional, concept integrity statement
- Materials and mood board: 6-8 materials with use case and feel description
- Traffic flow patterns with from/to/label for 6+ pathways
- Sightline analysis
- Lighting zones and strategy
- ADA compliance notes
- Rigging and infrastructure requirements
- Storage and back-of-house planning
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
    const { elementType, briefData, existingData, feedback } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = ELEMENT_SYSTEM_PROMPTS[elementType];
    if (!systemPrompt) throw new Error(`Unknown element type: ${elementType}`);

    let userPrompt = `Here is the creative brief data:\n\n${JSON.stringify(briefData, null, 2)}`;

    if (existingData) {
      userPrompt += `\n\nHere is the current content that needs to be improved or regenerated:\n${JSON.stringify(existingData, null, 2)}`;
    }

    if (feedback) {
      userPrompt += `\n\nUser feedback for this regeneration:\n${feedback}`;
    }

    userPrompt += `\n\nGenerate exhaustive, presentation-quality content. Be specific, bold, and strategic. Include industry-trending ideas and data points. This should read like a premium agency pitch deck.`;

    // Define the tool schema for structured output
    const toolSchema = getToolSchema(elementType);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [toolSchema],
        tool_choice: { type: "function", function: { name: `generate_${elementType}` } },
      }),
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      // Fallback: try to parse content directly
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          return new Response(JSON.stringify({ data: parsed }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ data: null, rawContent: content }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      throw new Error("No structured output returned");
    }

    const elementData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ data: elementData }), {
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
        description: "Generate Spatial Strategy",
        parameters: {
          type: "object",
          properties: {
            configs: { type: "array", items: { type: "object", properties: { footprintSize: { type: "string" }, totalSqft: { type: "number" }, zones: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, percentage: { type: "number" }, sqft: { type: "number" }, colorCode: { type: "string" }, position: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["x", "y", "width", "height"] }, requirements: { type: "array", items: { type: "string" } }, adjacencies: { type: "array", items: { type: "string" } }, notes: { type: "string" } }, required: ["id", "name", "percentage", "sqft", "colorCode", "position", "requirements"] } } }, required: ["footprintSize", "totalSqft", "zones"] } },
            scalingStrategy: { type: "object", properties: { whatScalesDown: { type: "array", items: { type: "string" } }, whatEliminates: { type: "array", items: { type: "string" } }, whatStaysProportional: { type: "array", items: { type: "string" } }, conceptIntegrity: { type: "string" } } },
            materialsAndMood: { type: "array", items: { type: "object", properties: { material: { type: "string" }, use: { type: "string" }, feel: { type: "string" } }, required: ["material", "use", "feel"] } },
            trafficFlow: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["from", "to", "label"] } },
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
