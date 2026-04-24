/**
 * PROJECT TYPE REGISTRY
 * ─────────────────────────────────────────────────────────────────────────
 * This file is the single source of truth for all project types in the app.
 * To add a new project type:
 *   1. Add the ID to ProjectTypeId union
 *   2. Add an entry to PROJECT_TYPE_REGISTRY
 *   3. Run a DB migration to add the new ID to the check constraint
 * ─────────────────────────────────────────────────────────────────────────
 */

export type ProjectTypeId =
  | "trade_show_booth"
  | "live_brand_activation"
  | "permanent_installation"
  | "film_premiere"
  | "game_release_activation"
  | "architectural_brief";

export interface ProjectTypeElementDef {
  /** Zustand / DB key (maps to ElementType) */
  key: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  /** Prompt guidance injected into the AI generation request for this type */
  aiGuidance: string;
}

export interface ProjectTypeCostCategory {
  key: string;
  label: string;
  description: string;
  typicalPercentage: number;
}

export interface ProjectTypeDef {
  id: ProjectTypeId;
  label: string;
  shortLabel: string;
  tagline: string;
  description: string;
  icon: string;
  accentColor: string;
  /** Used for render prompt framing */
  renderContext: string;
  /** Spatial defaults */
  spatialDefaults: {
    primaryUnit: "sqft" | "sqm" | "linear_ft";
    defaultSize: number;
    sizeLabel: string;
  };
  elements: ProjectTypeElementDef[];
  costCategories: ProjectTypeCostCategory[];
}

// ─── REGISTRY ────────────────────────────────────────────────────────────────

export const PROJECT_TYPE_REGISTRY: Record<ProjectTypeId, ProjectTypeDef> = {

  trade_show_booth: {
    id: "trade_show_booth",
    label: "Trade Show Booth",
    shortLabel: "Trade Show",
    tagline: "Turn your RFP into a render-ready exhibit design",
    description: "Convention & exhibition booths, inline, peninsula, and island configurations for B2B and B2C trade shows.",
    icon: "Landmark",
    accentColor: "hsl(38 92% 50%)",
    renderContext: "trade show exhibit booth on a convention hall floor with carpet, neighboring booths, overhead lighting",
    spatialDefaults: { primaryUnit: "sqft", defaultSize: 400, sizeLabel: "sq ft" },
    elements: [
      { key: "bigIdea", title: "Big Idea", description: "Core concept and strategic brand positioning", icon: "Lightbulb", color: "amber", aiGuidance: "Focus on trade show ROI, booth traffic drivers, and competitive differentiation on the show floor." },
      { key: "experienceFramework", title: "Experience Framework", description: "Visitor journey and zone design principles", icon: "Target", color: "blue", aiGuidance: "Map the visitor flow from aisle approach through qualification zones to VIP close, with dwell time targets per zone." },
      { key: "interactiveMechanics", title: "Interactive Mechanics", description: "Hero installation and engagement systems", icon: "Zap", color: "purple", aiGuidance: "Define the hero interaction that drives badge scans and demos, plus secondary touchpoints for passive traffic." },
      { key: "digitalStorytelling", title: "Digital Storytelling", description: "AV content strategy and screen architecture", icon: "Smartphone", color: "cyan", aiGuidance: "Specify LED wall content, looping demos, and audience-targeted content tracks for executive vs technical visitors." },
      { key: "humanConnection", title: "Human Connection", description: "Meeting zones and private conversation spaces", icon: "Handshake", color: "green", aiGuidance: "Design meeting room capacity, booking flow, and conversation zone configurations by footprint size." },
      { key: "adjacentActivations", title: "Adjacent Activations", description: "Off-booth events and hospitality experiences", icon: "Tent", color: "rose", aiGuidance: "Propose evening events, show-floor happy hours, and partner co-activations that extend booth impact." },
      { key: "spatialStrategy", title: "Spatial Strategy", description: "Floor plan zoning and traffic flow analysis", icon: "Ruler", color: "slate", aiGuidance: "Produce zone allocation by sqft, traffic flow diagrams, and ADA compliance notes for each footprint size." },
      { key: "budgetLogic", title: "Budget Logic", description: "Cost allocation and multi-show ROI analysis", icon: "Wallet", color: "emerald", aiGuidance: "Break down fabrication, A/V, logistics, labor, and show services costs with amortization across show schedule." },
    ],
    costCategories: [
      { key: "fabrication", label: "Fabrication", description: "Structure, millwork, graphics", typicalPercentage: 35 },
      { key: "av_tech", label: "A/V & Technology", description: "Screens, computers, interactive", typicalPercentage: 20 },
      { key: "show_services", label: "Show Services", description: "Drayage, electrical, rigging, labor", typicalPercentage: 25 },
      { key: "logistics", label: "Logistics & Storage", description: "Shipping, I&D, crates", typicalPercentage: 10 },
      { key: "contingency", label: "Contingency", description: "Reserve for overages", typicalPercentage: 10 },
    ],
  },

  live_brand_activation: {
    id: "live_brand_activation",
    label: "Live Brand Activation",
    shortLabel: "Brand Activation",
    tagline: "Design immersive brand moments that earn media coverage",
    description: "Pop-ups, experiential marketing events, brand stunts, street activations, and touring campaigns.",
    icon: "Zap",
    accentColor: "hsl(200 85% 55%)",
    renderContext: "live outdoor urban brand activation event space at night with LED lighting and crowd engagement",
    spatialDefaults: { primaryUnit: "sqft", defaultSize: 1500, sizeLabel: "sq ft" },
    elements: [
      { key: "bigIdea", title: "Brand Moment", description: "The single story this activation tells the world", icon: "Lightbulb", color: "amber", aiGuidance: "Define the earned media hook, cultural tension, and brand POV that makes this activation shareable and press-worthy." },
      { key: "experienceFramework", title: "Journey Architecture", description: "How guests move through the experience", icon: "Target", color: "blue", aiGuidance: "Map the arrival moment, peak experience beats, social capture opportunities, and exit memory creation." },
      { key: "interactiveMechanics", title: "Engagement Mechanics", description: "Participatory elements and crowd interactions", icon: "Zap", color: "purple", aiGuidance: "Design the participatory mechanism — what do guests DO? How does it scale from 1 person to 500?" },
      { key: "digitalStorytelling", title: "Content & Social Layer", description: "Real-time content, UGC amplification, live streams", icon: "Smartphone", color: "cyan", aiGuidance: "Design the social capture moments, hashtag mechanics, UGC amplification loop, and live content strategy." },
      { key: "humanConnection", title: "Brand Ambassador Strategy", description: "Staffing, talent, and human touchpoints", icon: "Handshake", color: "green", aiGuidance: "Define brand ambassador roles, talent integrations, guest interaction scripts, and VIP access tiers." },
      { key: "adjacentActivations", title: "Media & PR Extensions", description: "Press moments, influencer integrations, earned media", icon: "Tent", color: "rose", aiGuidance: "Identify pre-event hype builders, day-of press moments, influencer seeding strategy, and post-event content." },
      { key: "spatialStrategy", title: "Spatial Experience Design", description: "Zone flow, crowd management, instagrammable moments", icon: "Ruler", color: "slate", aiGuidance: "Design zones for arrival wow, primary experience, secondary discovery, social moments, and smooth egress." },
      { key: "budgetLogic", title: "Production Budget", description: "Build, staffing, permits, and media value analysis", icon: "Wallet", color: "emerald", aiGuidance: "Itemize production, permits, staffing, talent, and content costs against projected earned media value." },
    ],
    costCategories: [
      { key: "production", label: "Production & Build", description: "Fabrication, scenic, soft goods", typicalPercentage: 30 },
      { key: "talent_staffing", label: "Talent & Staffing", description: "Brand ambassadors, performers, security", typicalPercentage: 20 },
      { key: "av_lighting", label: "A/V & Lighting", description: "LED walls, sound, atmospheric lighting", typicalPercentage: 20 },
      { key: "permits_venues", label: "Permits & Venue", description: "Site fees, permits, insurance", typicalPercentage: 15 },
      { key: "content_media", label: "Content & Media", description: "Photography, video, social media", typicalPercentage: 15 },
    ],
  },

  permanent_installation: {
    id: "permanent_installation",
    label: "Permanent Installation",
    shortLabel: "Permanent Install",
    tagline: "Create spaces that tell your story every single day",
    description: "Flagship retail environments, brand museums, visitor centers, corporate lobbies, and cultural institution installs.",
    icon: "Building2",
    accentColor: "hsl(150 70% 45%)",
    renderContext: "permanent branded interior installation in a modern retail flagship or museum space with polished finishes",
    spatialDefaults: { primaryUnit: "sqft", defaultSize: 3000, sizeLabel: "sq ft" },
    elements: [
      { key: "bigIdea", title: "Spatial Narrative", description: "The story the space tells in perpetuity", icon: "Lightbulb", color: "amber", aiGuidance: "Define the overarching spatial narrative — what should visitors understand, feel, and remember after 5 minutes in this space?" },
      { key: "experienceFramework", title: "Visitor Journey Design", description: "How the space unfolds chapter by chapter", icon: "Target", color: "blue", aiGuidance: "Map the spatial sequence from arrival to departure with emotional beats, discovery moments, and dwell zone design." },
      { key: "interactiveMechanics", title: "Interactive & Tactile Systems", description: "Permanent interactive elements and technology", icon: "Zap", color: "purple", aiGuidance: "Design lasting interactive systems — touchscreens, sensor-driven elements, and tactile engagements built for high-traffic longevity." },
      { key: "digitalStorytelling", title: "Content Management System", description: "Dynamic content, updateable media, digital layers", icon: "Smartphone", color: "cyan", aiGuidance: "Design the CMS architecture for updateable content, seasonal campaigns, and data-driven personalization built into the space." },
      { key: "humanConnection", title: "Staff & Service Design", description: "Associates, guided experiences, service touchpoints", icon: "Handshake", color: "green", aiGuidance: "Design the associate role, service stations, guided tour flow, and membership/loyalty integration points." },
      { key: "adjacentActivations", title: "Programming Calendar", description: "Events, limited editions, community activations", icon: "Tent", color: "rose", aiGuidance: "Propose recurring programming — weekly events, seasonal installations, community programs, and VIP access tiers." },
      { key: "spatialStrategy", title: "Architecture & Materials", description: "Architectural language, material palette, finishes", icon: "Ruler", color: "slate", aiGuidance: "Define the architectural approach, material hierarchy, sustainability strategy, accessibility compliance, and construction methodology." },
      { key: "budgetLogic", title: "CapEx & OpEx Model", description: "Build cost, amortization, and ongoing operating costs", icon: "Wallet", color: "emerald", aiGuidance: "Model capital expenditure with 5-10 year amortization, plus ongoing OpEx for staffing, content updates, and maintenance." },
    ],
    costCategories: [
      { key: "architecture_build", label: "Architecture & Build", description: "GC, FF&E, millwork, finishes", typicalPercentage: 50 },
      { key: "technology", label: "Technology & A/V", description: "Screens, sensors, network, interactive", typicalPercentage: 20 },
      { key: "content", label: "Content & Programming", description: "Media production, digital content", typicalPercentage: 10 },
      { key: "design_fees", label: "Design & Consulting", description: "Architecture, ID, branding fees", typicalPercentage: 12 },
      { key: "contingency", label: "Contingency", description: "Reserve for site unknowns", typicalPercentage: 8 },
    ],
  },

  film_premiere: {
    id: "film_premiere",
    label: "Film / Event Premiere",
    shortLabel: "Premiere",
    tagline: "Concept builds that make headlines and create cultural moments",
    description: "Movie and TV premieres, album releases, award ceremonies, theatrical pop-ups, and entertainment IP activations.",
    icon: "Clapperboard",
    accentColor: "hsl(45 95% 58%)",
    renderContext: "glamorous red carpet movie premiere event with theatrical lighting, floral installations, and celebrity atmosphere",
    spatialDefaults: { primaryUnit: "linear_ft", defaultSize: 150, sizeLabel: "ft of red carpet" },
    elements: [
      { key: "bigIdea", title: "Narrative Concept", description: "The cinematic story the experience tells", icon: "Lightbulb", color: "amber", aiGuidance: "Define the IP-driven narrative concept — what chapter of the film's story does this experience bring to life? What emotion does the guest carry away?" },
      { key: "experienceFramework", title: "Press & Guest Journey", description: "Media line, arrivals, fan zones, and VIP flow", icon: "Target", color: "blue", aiGuidance: "Design the complete arrivals experience — fan pen energy, press line choreography, step-and-repeat moments, and talent flow to green room." },
      { key: "interactiveMechanics", title: "Photo Moments & Activations", description: "Shareable installations and immersive set pieces", icon: "Zap", color: "purple", aiGuidance: "Design 3-5 must-photograph activation moments tied to IP themes — set-piece recreations, AR moments, and social media-first builds." },
      { key: "digitalStorytelling", title: "Media & Content Strategy", description: "Live coverage, social takeovers, premiere night content", icon: "Smartphone", color: "cyan", aiGuidance: "Plan the content capture strategy — credentialed photographers, social teams, livestream production, and exclusive content distribution." },
      { key: "humanConnection", title: "Talent & Talent Staging", description: "Talent flow, green room, interview positions, security", icon: "Handshake", color: "green", aiGuidance: "Choreograph talent movement from arrival to screening — green room design, interview position setup, fan interaction moments, and secure egress." },
      { key: "adjacentActivations", title: "Fan & Community Extensions", description: "Fan screenings, pop-ups, merchandise moments", icon: "Tent", color: "rose", aiGuidance: "Design the fan experience extensions — public pop-ups, digital fan access, merchandise drops, and community screening programs." },
      { key: "spatialStrategy", title: "Venue & Set Design", description: "Spatial layout, production design, lighting drama", icon: "Ruler", color: "slate", aiGuidance: "Define the venue transformation strategy — entrance architecture, red carpet staging, lobby takeover, and theatrical lighting narrative." },
      { key: "budgetLogic", title: "Event Production Budget", description: "Venue, production, talent fees, media, and security", icon: "Wallet", color: "emerald", aiGuidance: "Break down venue hire, production design, floral/décor, talent fees, security, catering, and media production costs." },
    ],
    costCategories: [
      { key: "venue_transform", label: "Venue & Transformation", description: "Venue hire, scenic, décor, florals", typicalPercentage: 35 },
      { key: "talent_security", label: "Talent & Security", description: "Greenroom, talent riders, security detail", typicalPercentage: 20 },
      { key: "production", label: "Event Production", description: "Lighting, sound, A/V, staging", typicalPercentage: 20 },
      { key: "media_content", label: "Media & Content", description: "Press line production, photography, video", typicalPercentage: 15 },
      { key: "catering_hospitality", label: "Catering & Hospitality", description: "Cocktail reception, press catering", typicalPercentage: 10 },
    ],
  },

  game_release_activation: {
    id: "game_release_activation",
    label: "Game Release Activation",
    shortLabel: "Game Launch",
    tagline: "Launch events as epic as the games they celebrate",
    description: "Video game launches, esports activations, gaming conventions, fan festivals, and interactive gaming pop-ups.",
    icon: "Gamepad2",
    accentColor: "hsl(280 75% 60%)",
    renderContext: "epic video game launch activation event with RGB LED lighting, massive gaming screens, and esports arena energy",
    spatialDefaults: { primaryUnit: "sqft", defaultSize: 5000, sizeLabel: "sq ft" },
    elements: [
      { key: "bigIdea", title: "World Activation Concept", description: "Bringing the game world into physical reality", icon: "Lightbulb", color: "amber", aiGuidance: "Define how the game's world, narrative, and aesthetic are physically manifested — what does it feel like to step inside the game's universe?" },
      { key: "experienceFramework", title: "Player Journey", description: "How fans progress from hype to play to community", icon: "Target", color: "blue", aiGuidance: "Design the player progression arc — pre-registration hype, arrival energy, play queue management, community zone, and post-play sharing." },
      { key: "interactiveMechanics", title: "Playable Demo Architecture", description: "Gaming stations, tournament pods, and try-it zones", icon: "Zap", color: "purple", aiGuidance: "Design the playable demo footprint — station count, queue UX, hardware specs, competitive tournament bracket flow, and audience viewing." },
      { key: "digitalStorytelling", title: "Streaming & Content Layer", description: "Twitch integrations, content creator zones, VOD capture", icon: "Smartphone", color: "cyan", aiGuidance: "Design the streaming infrastructure — content creator pods, broadcast quality setups, Twitch overlays, and live clip amplification." },
      { key: "humanConnection", title: "Community & Developer Access", description: "Dev panels, community meetups, cosplay, fan moments", icon: "Handshake", color: "green", aiGuidance: "Plan developer meet-and-greet sessions, community panel formats, cosplay competitions, and fan connection programming." },
      { key: "adjacentActivations", title: "Merch & Collectible Drops", description: "Exclusive merchandise, NFTs, collector moments", icon: "Tent", color: "rose", aiGuidance: "Design the merch activation — limited drops, collab items, collectible moments, and scarcity mechanics that drive social buzz." },
      { key: "spatialStrategy", title: "World-Building Spatial Design", description: "Immersive environment design mirroring game aesthetics", icon: "Ruler", color: "slate", aiGuidance: "Define the spatial narrative zones — entry world-build, hero gameplay zone, lore gallery, community hub, and merch zone with queuing strategy." },
      { key: "budgetLogic", title: "Production & Marketing Budget", description: "Build, hardware, staffing, talent, and media value", icon: "Wallet", color: "emerald", aiGuidance: "Break down venue, scenic build, gaming hardware, staffing, talent fees, streaming production, and estimated earned media value." },
    ],
    costCategories: [
      { key: "scenic_build", label: "Scenic & World Build", description: "Set design, props, scenic elements", typicalPercentage: 25 },
      { key: "gaming_hardware", label: "Gaming Hardware", description: "Consoles, PCs, peripherals, displays", typicalPercentage: 25 },
      { key: "av_streaming", label: "A/V & Streaming", description: "LED walls, broadcast, streaming tech", typicalPercentage: 20 },
      { key: "talent_staffing", label: "Talent & Staffing", description: "Developers, cosplay, brand staff, security", typicalPercentage: 20 },
      { key: "merch_content", label: "Merch & Content", description: "Exclusive drops, photography, social", typicalPercentage: 10 },
    ],
  },

  architectural_brief: {
    id: "architectural_brief",
    label: "Architectural Brief",
    shortLabel: "Architecture",
    tagline: "From concept to construction-ready spatial intelligence",
    description: "Commercial interiors, brand environments, hospitality spaces, cultural buildings, and mixed-use development concepts.",
    icon: "Building",
    accentColor: "hsl(200 60% 50%)",
    renderContext: "architectural interior visualization of a modern commercial or hospitality space with high-end finishes and natural light",
    spatialDefaults: { primaryUnit: "sqm", defaultSize: 500, sizeLabel: "sq m" },
    elements: [
      { key: "bigIdea", title: "Design Concept", description: "Architectural vision and design philosophy", icon: "Lightbulb", color: "amber", aiGuidance: "Define the overarching design concept — the formal idea, cultural reference, and spatial philosophy that drives every design decision." },
      { key: "experienceFramework", title: "Spatial Experience", description: "How the architecture orchestrates human movement", icon: "Target", color: "blue", aiGuidance: "Map the experiential sequence — approach, arrival, primary space discovery, circulation logic, and departure memory." },
      { key: "interactiveMechanics", title: "Program & Functionality", description: "Functional program, use-case zoning, flexibility", icon: "Zap", color: "purple", aiGuidance: "Define the complete functional program — area schedule, use requirements, flexibility provisions, and operational adjacencies." },
      { key: "digitalStorytelling", title: "Technology Integration", description: "Smart building, AV, digital wayfinding, sustainability", icon: "Smartphone", color: "cyan", aiGuidance: "Specify smart building systems, integrated A/V, digital signage strategy, occupancy analytics, and building automation." },
      { key: "humanConnection", title: "Human-Centered Design", description: "Wellbeing, accessibility, biophilic, and social design", icon: "Handshake", color: "green", aiGuidance: "Address acoustic comfort, daylighting strategy, biophilic elements, neurodiversity considerations, and universal accessibility beyond ADA minimums." },
      { key: "adjacentActivations", title: "Sustainability Strategy", description: "LEED/WELL targets, materials, and environmental performance", icon: "Tent", color: "rose", aiGuidance: "Define sustainability targets (LEED, WELL, BREEAM), passive design strategies, material circularity, and operational carbon reduction." },
      { key: "spatialStrategy", title: "Architectural Systems", description: "Structure, envelope, MEP coordination, constructability", icon: "Ruler", color: "slate", aiGuidance: "Outline structural strategy, building envelope performance, MEP system integration, construction phasing, and site-specific constraints." },
      { key: "budgetLogic", title: "Cost Plan", description: "Elemental cost model, value engineering options, contingency", icon: "Wallet", color: "emerald", aiGuidance: "Produce an elemental cost plan (£/sqm or $/sqft), identify value engineering opportunities, and model contingency against design risk." },
    ],
    costCategories: [
      { key: "structure_envelope", label: "Structure & Envelope", description: "Foundation, frame, façade, roofing", typicalPercentage: 35 },
      { key: "interior_fit_out", label: "Interior Fit-Out", description: "FF&E, finishes, millwork, flooring", typicalPercentage: 30 },
      { key: "mep", label: "MEP & Sustainability", description: "Mechanical, electrical, plumbing, renewables", typicalPercentage: 20 },
      { key: "design_consultants", label: "Design & Consultants", description: "Architecture, engineering, landscape fees", typicalPercentage: 10 },
      { key: "contingency", label: "Contingency", description: "Design and site risk reserve", typicalPercentage: 5 },
    ],
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

export const ALL_PROJECT_TYPES = Object.values(PROJECT_TYPE_REGISTRY);

export function getProjectType(id: ProjectTypeId | string): ProjectTypeDef {
  return PROJECT_TYPE_REGISTRY[id as ProjectTypeId] ?? PROJECT_TYPE_REGISTRY.trade_show_booth;
}

export function getElementsForType(typeId: ProjectTypeId | string): ProjectTypeElementDef[] {
  return getProjectType(typeId).elements;
}

export function getElementKeysForType(typeId: ProjectTypeId | string): string[] {
  return getElementsForType(typeId).map((e) => e.key);
}

export const DEFAULT_PROJECT_TYPE: ProjectTypeId = "trade_show_booth";
