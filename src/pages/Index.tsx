import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Network,
  CheckCircle2,
  Upload,
  Wand2,
  Grid3X3,
  Download,
  Target,
  Boxes,
  BookOpen,
  ShieldCheck,
  Layers,
  Brain,
  Compass,
  Check,
  Zap,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CanopyLogo,
  CanopyAmbientGlow,
  CanopyPanel,
} from "@/components/canopy";
import { Reveal } from "@/components/landing/Reveal";
import { useScrollY } from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";

import showcaseEnergy from "@/assets/showcase-energy.jpg";
import showcaseLounge from "@/assets/showcase-lounge.jpg";
import showcaseInstallation from "@/assets/showcase-installation.jpg";
import showcaseFloorplan from "@/assets/showcase-floorplan.jpg";
import intelligenceNetwork from "@/assets/intelligence-network.jpg";
import heroArchitecture from "@/assets/hero-architecture.jpg";
import heroInstallation from "@/assets/hero-installation.jpg";
import showcaseUber from "@/assets/showcase-uber.png";
import showcaseSamsung from "@/assets/showcase-samsung.png";
import showcaseTesla from "@/assets/showcase-tesla.png";
import showcaseTopps from "@/assets/showcase-topps.png";
import showcaseNike from "@/assets/showcase-nike.png";
import showcaseNetflix from "@/assets/showcase-netflix.png";

const HERO_ROTATION = [
  showcaseUber,
  showcaseSamsung,
  showcaseTesla,
  showcaseTopps,
  showcaseNike,
  showcaseNetflix,
];

// ─── CONTENT ──────────────────────────────────────────────────────────────

const SHOWCASE = [
  {
    img: showcaseUber,
    label: "Festival / Mobility",
    title: "Uber — Music moves",
    sub: "Pickup zone, lounge & stage activation. Wayfinding-led.",
    span: "lg:col-span-2 lg:row-span-2",
  },
  {
    img: showcaseSamsung,
    label: "Consumer Tech",
    title: "Samsung — AI for All",
    sub: "Halo ring architecture. Multi-zone product theater.",
    span: "lg:col-span-2 lg:row-span-1",
  },
  {
    img: showcaseTesla,
    label: "Automotive",
    title: "Tesla — Sustainable Energy",
    sub: "Floating canopy. Vehicle + ecosystem staging.",
    span: "lg:col-span-1 lg:row-span-1",
  },
  {
    img: showcaseTopps,
    label: "Sports / Retail",
    title: "Topps — Collect. Connect.",
    sub: "Hero LED. Pack rip moments. Trade zones.",
    span: "lg:col-span-1 lg:row-span-1",
  },
  {
    img: showcaseEnergy,
    label: "Energy / Sport",
    title: "Athletic brand activation",
    sub: "Sculptural canopy. Crowd-flow optimized.",
    span: "lg:col-span-1 lg:row-span-1",
  },
  {
    img: showcaseLounge,
    label: "Hospitality",
    title: "VIP brand lounge",
    sub: "Curated for intimate conversations.",
    span: "lg:col-span-1 lg:row-span-1",
  },
];

const PILLARS = [
  {
    icon: Network,
    title: "Spatial intelligence",
    copy: "Every object, client, and project becomes a node in a living graph. Canopy learns your agency's DNA once — then applies it everywhere.",
  },
  {
    icon: BookOpen,
    title: "4-scope RAG engine",
    copy: "Agency, activation type, client, and project knowledge stack automatically so every generation is grounded in the right context.",
  },
  {
    icon: Wand2,
    title: "AI skills built-in",
    copy: "Auto-tag documents, extract rate cards, summarize briefs, check brand compliance, and surface past-project best practices — all in-app.",
  },
  {
    icon: Compass,
    title: "Brief to render in a day",
    copy: "Upload any brief. Parse it. Generate strategic elements, hero renders, spatial plans, and a pitch-ready export — in one uninterrupted flow.",
  },
];

const WORKFLOW = [
  { n: "01", label: "Brief", detail: "PDF, DOCX, or paste text.", icon: Upload },
  { n: "02", label: "Parse", detail: "AI extracts brand, budget, audience, spatial needs.", icon: Target },
  { n: "03", label: "Ground", detail: "Pull relevant chunks from agency + client KB.", icon: BookOpen },
  { n: "04", label: "Generate", detail: "Strategic elements, hero visual, 8 view angles.", icon: Sparkles },
  { n: "05", label: "Plan", detail: "Interactive floor plan with activation zones.", icon: Grid3X3 },
  { n: "06", label: "Deliver", detail: "Pitch deck + prompt suite + cost intelligence.", icon: Download },
];

const INTELLIGENCE = [
  {
    icon: Brain,
    title: "Brand intelligence",
    copy: "Web-scraped guidelines, hex codes, voice, and historical learnings from every client engagement — refreshed continuously.",
  },
  {
    icon: Layers,
    title: "Activation type playbooks",
    copy: "Define what a Demo Station, VIP Lounge, or Stage Area means to your agency. Templates and references train the model.",
  },
  {
    icon: ShieldCheck,
    title: "Brand compliance audit",
    copy: "Generated designs are audited against each client's brand guidelines before they leave the system. Pass / warn / fail verdicts.",
  },
  {
    icon: Boxes,
    title: "Cost intelligence",
    copy: "Materials, vendors, drayage, labor, and venue costs blend manual entry with AI web research for accurate budget logic.",
  },
];

const STATS = [
  { value: "< 24h", label: "Brief to first render" },
  { value: "4", label: "Knowledge scopes per generation" },
  { value: "15+", label: "Activation types supported" },
  { value: "8", label: "Render angles per project" },
];

const TIERS = [
  {
    name: "Studio",
    price: "$499",
    cadence: "/ month",
    blurb: "For boutique agencies running a handful of pitches a quarter.",
    features: [
      "1 agency workspace",
      "Up to 3 seats",
      "10 projects / month",
      "All 15+ activation types",
      "4-scope RAG engine",
      "Standard exports (PDF + PPTX)",
    ],
    cta: "Start Studio",
    highlight: false,
  },
  {
    name: "Agency",
    price: "$1,499",
    cadence: "/ month",
    blurb: "For experiential teams shipping multiple briefs every week.",
    features: [
      "1 agency workspace",
      "Up to 15 seats",
      "Unlimited projects",
      "Custom activation type playbooks",
      "Brand intelligence + compliance audits",
      "Cost intelligence + venue database",
      "3D Rhino polish + video generation",
      "Priority AI compute",
    ],
    cta: "Start Agency",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    blurb: "Multi-agency networks, holding companies, and global rollouts.",
    features: [
      "Unlimited workspaces",
      "Unlimited seats",
      "SSO + custom roles",
      "Dedicated AI capacity",
      "White-label exports",
      "Custom integrations (Figma, CAD, CRM)",
      "Onboarding + dedicated support",
    ],
    cta: "Talk to sales",
    highlight: false,
  },
];

// ─── PAGE ─────────────────────────────────────────────────────────────────

export default function Index() {
  const [mounted, setMounted] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const scrollY = useScrollY();

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeroIdx((i) => (i + 1) % HERO_ROTATION.length);
    }, 5500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <header className="fixed inset-x-0 top-0 z-50 glass border-b border-white/5">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center" aria-label="Canopy home">
            <CanopyLogo variant="horizontal" size="md" showByline />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#showcase" className="text-muted-foreground hover:text-foreground transition-colors">
              Work
            </a>
            <a href="#system" className="text-muted-foreground hover:text-foreground transition-colors">
              System
            </a>
            <a href="#intelligence" className="text-muted-foreground hover:text-foreground transition-colors">
              Intelligence
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <Link to="/auth">
              <Button size="sm" variant="ghost" className="text-foreground/80 hover:text-foreground">
                Sign in
              </Button>
            </Link>
            <Link to="/projects">
              <Button size="sm" className="canopy-button-primary">
                Enter
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* ═══ HERO ═════════════════════════════════════════════════════ */}
      <section className="relative min-h-[100svh] flex items-center overflow-hidden">
        {/* Rotating background imagery */}
        <div className="absolute inset-0" aria-hidden>
          {HERO_ROTATION.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: i === heroIdx ? 0.85 : 0,
                transform: `scale(${i === heroIdx ? 1.06 : 1.02}) translateY(${scrollY * 0.08}px)`,
                transition:
                  "opacity 2200ms ease-in-out, transform 9000ms ease-out",
              }}
            />
          ))}
          {/* Readability scrims — left-weighted so copy stays legible, right side shows imagery */}
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-transparent to-background/40" />
        </div>

        <div className="absolute inset-0 canopy-grid-pattern opacity-20" aria-hidden />

        <CanopyAmbientGlow position="top-1/4 -left-32" size={520} tone="violet" opacity={0.22} animate />
        <CanopyAmbientGlow position="bottom-0 right-0 translate-x-1/3 translate-y-1/3" size={600} tone="pink" opacity={0.18} animate />

        <div className="container relative z-10 pt-24 pb-16">
          <div className="max-w-2xl">
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur-sm mb-8 transition-all duration-700",
                mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
              )}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#A78BFA] to-[#F472B6] animate-canopy-pulse" />
              A spatial operating system for experiential planning
            </div>

            <h1
              className={cn(
                "text-5xl md:text-7xl font-semibold leading-[1.02] tracking-tight mb-6 transition-all duration-700 delay-100",
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
              )}
            >
              Design the experience
              <br />
              <span className="canopy-text-full-gradient">before it happens.</span>
            </h1>

            <p
              className={cn(
                "text-lg md:text-xl text-foreground/70 leading-relaxed mb-10 max-w-xl transition-all duration-700 delay-200",
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
              )}
            >
              Canopy turns a brief into a coordinated spatial response — grounded in your agency's
              playbooks, your client's brand, and every past project you've ever shipped.
            </p>

            <div
              className={cn(
                "flex flex-col sm:flex-row gap-3 mb-14 transition-all duration-700 delay-300",
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
              )}
            >
              <Link to="/projects">
                <Button size="lg" className="canopy-button-primary h-14 px-8 text-base">
                  <Upload className="mr-2 h-4 w-4" />
                  Start a project
                </Button>
              </Link>
              <a href="#showcase">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-14 px-8 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-foreground/90"
                >
                  See the work
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>

            <div
              className={cn(
                "flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-foreground/45 transition-all duration-700 delay-500",
                mounted ? "opacity-100" : "opacity-0",
              )}
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#A78BFA]" />
                Multi-tenant for agencies + teams
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#A78BFA]" />
                4-scope RAG with pgvector
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#A78BFA]" />
                AI skills on every upload
              </span>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      </section>

      {/* ═══ SHOWCASE GRID ════════════════════════════════════════════ */}
      <section id="showcase" className="relative py-28 border-t border-white/5">
        <CanopyAmbientGlow position="top-0 left-1/3" size={500} tone="violet" opacity={0.12} />

        <div className="container relative">
          <Reveal className="max-w-3xl mb-16">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F472B6] mb-3">
              Selected work
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Spaces that get built.
              <br />
              <span className="canopy-text-gradient">Not just rendered.</span>
            </h2>
            <p className="mt-5 text-foreground/60 text-lg max-w-2xl">
              From energy giants to consumer tech to luxury auto — every Canopy output is engineered
              for execution. Not eye candy. Real materials, real labor, real budgets.
            </p>
          </Reveal>

          {/* Bento-style showcase */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-3 gap-4 lg:gap-5 lg:auto-rows-[220px]">
            {SHOWCASE.map((s, i) => (
              <Reveal
                key={s.title}
                delay={i * 80}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] min-h-[260px]",
                  s.span,
                )}
              >
                <img
                  src={s.img}
                  alt={s.title}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/[0.04] group-hover:ring-white/20 transition-all" />

                <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F472B6] mb-2">
                    {s.label}
                  </div>
                  <div className="text-lg md:text-xl font-semibold mb-1 leading-tight">{s.title}</div>
                  <div className="text-xs md:text-sm text-foreground/60 leading-snug">{s.sub}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ THE SYSTEM (PILLARS) ═══════════════════════════════════ */}
      <section id="system" className="relative py-28 border-t border-white/5">
        <CanopyAmbientGlow position="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size={800} tone="sky" opacity={0.12} />

        <div className="container relative">
          <Reveal className="max-w-3xl mb-16">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A78BFA] mb-3">
              The system
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Not another dashboard.
              <br />
              <span className="canopy-text-gradient">A living interface for spatial work.</span>
            </h2>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5">
            {PILLARS.map((pillar, i) => (
              <Reveal key={pillar.title} delay={i * 100} from="up">
                <CanopyPanel interactive padded className="group relative overflow-hidden h-full">
                  <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-canopy-gradient opacity-10 blur-2xl transition-opacity duration-500 group-hover:opacity-25" />
                  <div className="relative flex items-start gap-4">
                    <div className="shrink-0 h-11 w-11 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                      <pillar.icon className="h-5 w-5 text-[#A78BFA]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">{pillar.title}</h3>
                      <p className="text-sm text-foreground/65 leading-relaxed">{pillar.copy}</p>
                    </div>
                  </div>
                </CanopyPanel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FLOOR PLAN FEATURE ═══════════════════════════════════════ */}
      <section className="relative py-28 border-t border-white/5 overflow-hidden">
        <CanopyAmbientGlow position="bottom-0 left-0" size={500} tone="violet" opacity={0.18} />

        <div className="container relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal from="left">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6FA8FF] mb-3">
                Spatial planning
              </div>
              <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-5">
                A floor plan that
                <br />
                <span className="canopy-text-gradient">thinks like a designer.</span>
              </h2>
              <p className="text-foreground/65 text-lg leading-relaxed mb-8">
                Drag, resize, and re-zone activation areas on an interactive plan. Canopy validates
                adjacencies, flow, sightlines, and constraints in real time — so your spatial story
                holds up the moment a CAD lead opens it.
              </p>

              <ul className="space-y-3">
                {[
                  "Color-coded zones for hero, storytelling, lounge, reception",
                  "Adjacency + flow rules per activation type",
                  "Cost overlays tied to zone area and material spec",
                  "B&W blocking diagrams + photoreal renders, side by side",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-foreground/75">
                    <Check className="h-4 w-4 text-[#A78BFA] mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal from="right" delay={100}>
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02]">
                <img
                  src={showcaseFloorplan}
                  alt="Spatial floor plan with activation zones"
                  loading="lazy"
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-foreground/45">
                <Grid3X3 className="h-3.5 w-3.5" />
                Zones · adjacencies · annotated dimensions
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ INTELLIGENCE ════════════════════════════════════════════ */}
      <section id="intelligence" className="relative py-28 border-t border-white/5 overflow-hidden">
        <div className="absolute inset-0 canopy-grid-pattern opacity-40" />
        <CanopyAmbientGlow position="top-0 right-0" size={600} tone="pink" opacity={0.15} />

        <div className="container relative">
          <Reveal className="max-w-3xl mb-16 text-center mx-auto">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A78BFA] mb-3">
              Intelligence
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
              Trained on your work.
              <br />
              <span className="canopy-text-gradient">Grounded in your brands.</span>
            </h2>
            <p className="text-foreground/60 text-lg">
              Canopy is not a prompt wrapper. It's a four-scope retrieval engine that pulls the
              right knowledge — at the right level — into every generation.
            </p>
          </Reveal>

          <Reveal className="relative rounded-2xl overflow-hidden border border-white/10 mb-12 max-w-5xl mx-auto" from="scale">
            <img
              src={intelligenceNetwork}
              alt="RAG knowledge network visualization"
              loading="lazy"
              className="w-full h-[280px] md:h-[360px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
                {[
                  { label: "Agency", weight: "1.00", color: "#A78BFA" },
                  { label: "Activation Type", weight: "0.92", color: "#C084FC" },
                  { label: "Client Brand", weight: "0.85", color: "#F472B6" },
                  { label: "Project", weight: "1.00", color: "#6FA8FF" },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-white/10 bg-background/60 backdrop-blur p-3">
                    <div className="text-[10px] uppercase tracking-widest text-foreground/55">{s.label}</div>
                    <div className="text-lg font-semibold mt-1" style={{ color: s.color }}>{s.weight}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
            {INTELLIGENCE.map((cap, i) => (
              <Reveal key={cap.title} delay={i * 80}>
                <CanopyPanel interactive padded className="group relative overflow-hidden h-full">
                  <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-canopy-gradient opacity-5 blur-3xl transition-opacity duration-500 group-hover:opacity-15" />
                  <div className="relative flex items-start gap-4">
                    <div className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-[#A78BFA]/20 to-[#F472B6]/20 border border-white/10 flex items-center justify-center">
                      <cap.icon className="h-5 w-5 text-[#C084FC]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2">{cap.title}</h3>
                      <p className="text-sm text-foreground/65 leading-relaxed">{cap.copy}</p>
                    </div>
                  </div>
                </CanopyPanel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WORKFLOW ═══════════════════════════════════════════════ */}
      <section id="workflow" className="relative py-28 border-y border-white/5">
        <div className="container relative">
          <Reveal className="max-w-2xl mx-auto text-center mb-20">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6FA8FF] mb-3">
              The workflow
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
              Six connected steps.
              <br />
              <span className="canopy-text-gradient">One coordinated output.</span>
            </h2>
            <p className="text-foreground/60 text-lg">
              Each step feeds the next — strategy flows into space, space flows into renders,
              renders flow into the deck.
            </p>
          </Reveal>

          <Reveal className="relative max-w-5xl mx-auto">
            <div
              className="hidden lg:block absolute top-[26px] left-[8%] right-[8%] h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.35), rgba(244,114,182,0.35), transparent)" }}
              aria-hidden
            />

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-3">
              {WORKFLOW.map((step, i) => (
                <div key={step.n} className="flex flex-col items-center text-center group">
                  <div className="relative mb-4">
                    <div
                      className="w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                      style={{ background: "var(--gradient-canopy)" }}
                    >
                      <div className="absolute inset-[3px] rounded-full bg-background flex items-center justify-center">
                        <step.icon className="h-5 w-5 text-[#A78BFA]" />
                      </div>
                    </div>
                    <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-white/10 flex items-center justify-center text-[9px] font-mono font-semibold text-foreground/80">
                      {i + 1}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-1">{step.label}</div>
                    <div className="text-xs text-foreground/55 leading-snug max-w-[150px] mx-auto">
                      {step.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ STATS STRIP ════════════════════════════════════════════ */}
      <section className="relative py-16">
        <CanopyAmbientGlow position="top-1/2 left-1/4 -translate-y-1/2" size={400} tone="violet" opacity={0.15} />

        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((stat, i) => (
              <Reveal key={stat.label} delay={i * 80} from="scale">
                <CanopyPanel padded className="text-center">
                  <div className="text-4xl md:text-5xl font-semibold canopy-text-gradient mb-2">
                    {stat.value}
                  </div>
                  <div className="text-xs uppercase tracking-widest text-foreground/55">
                    {stat.label}
                  </div>
                </CanopyPanel>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ INLINE GALLERY (parallax band) ═════════════════════════ */}
      <section className="relative py-28 border-t border-white/5 overflow-hidden">
        <Reveal className="container max-w-3xl text-center mb-14">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F472B6] mb-3">
            Render fidelity
          </div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
            From hero shot to
            <br />
            <span className="canopy-text-gradient">eight coordinated angles.</span>
          </h2>
        </Reveal>

        <div
          className="flex gap-5 px-6"
          style={{ transform: `translateX(${-scrollY * 0.06}px)` }}
        >
          {[heroArchitecture, showcaseUber, showcaseSamsung, heroInstallation, showcaseTesla, showcaseTopps, showcaseLounge, showcaseInstallation].map((src, i) => (
            <div
              key={i}
              className="shrink-0 w-[320px] md:w-[440px] h-[260px] md:h-[320px] rounded-2xl overflow-hidden border border-white/10 relative"
            >
              <img src={src} alt="" loading="lazy" className="w-full h-full object-cover" />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/10" />
            </div>
          ))}
        </div>
      </section>

      {/* ═══ PRICING ════════════════════════════════════════════════ */}
      <section id="pricing" className="relative py-28 border-t border-white/5">
        <CanopyAmbientGlow position="top-0 left-1/2 -translate-x-1/2" size={700} tone="full" opacity={0.12} />

        <div className="container relative">
          <Reveal className="max-w-2xl mx-auto text-center mb-16">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A78BFA] mb-3">
              Pricing
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
              Built for agencies.
              <br />
              <span className="canopy-text-gradient">Priced for the work.</span>
            </h2>
            <p className="text-foreground/60 text-lg">
              Every tier includes the full system. Choose by team size and project volume.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5 max-w-6xl mx-auto">
            {TIERS.map((tier, i) => (
              <Reveal key={tier.name} delay={i * 100} from="up">
                <div
                  className={cn(
                    "relative rounded-2xl border p-8 h-full flex flex-col",
                    tier.highlight
                      ? "border-transparent bg-gradient-to-b from-[#A78BFA]/[0.08] to-transparent"
                      : "border-white/[0.08] bg-white/[0.02]",
                  )}
                  style={
                    tier.highlight
                      ? { boxShadow: "0 0 0 1px rgba(167,139,250,0.4), 0 24px 48px -16px rgba(167,139,250,0.2)" }
                      : undefined
                  }
                >
                  {tier.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <div className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest text-background bg-canopy-gradient">
                        Most popular
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-2">
                    {tier.name === "Studio" && <Zap className="h-4 w-4 text-[#A78BFA]" />}
                    {tier.name === "Agency" && <Sparkles className="h-4 w-4 text-[#F472B6]" />}
                    {tier.name === "Enterprise" && <Building2 className="h-4 w-4 text-[#6FA8FF]" />}
                    <h3 className="text-xl font-semibold">{tier.name}</h3>
                  </div>

                  <p className="text-sm text-foreground/60 mb-6 leading-relaxed">{tier.blurb}</p>

                  <div className="mb-6">
                    <span
                      className={cn(
                        "text-4xl font-semibold",
                        tier.highlight ? "canopy-text-full-gradient" : "text-foreground",
                      )}
                    >
                      {tier.price}
                    </span>
                    {tier.cadence && (
                      <span className="text-sm text-foreground/55 ml-1">{tier.cadence}</span>
                    )}
                  </div>

                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/75">
                        <Check
                          className={cn(
                            "h-4 w-4 mt-0.5 shrink-0",
                            tier.highlight ? "text-[#F472B6]" : "text-[#A78BFA]",
                          )}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to={tier.name === "Enterprise" ? "/auth" : "/projects"}>
                    <Button
                      className={cn(
                        "w-full h-12 rounded-full",
                        tier.highlight
                          ? "canopy-button-primary"
                          : "border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-foreground",
                      )}
                      variant={tier.highlight ? "default" : "ghost"}
                    >
                      {tier.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-10 text-center text-xs text-foreground/45 max-w-2xl mx-auto">
            All plans include unlimited briefs uploaded, full access to all 15+ activation types,
            and the complete export package. AI compute is metered fairly per generation.
          </Reveal>
        </div>
      </section>

      {/* ═══ FINAL CTA ═════════════════════════════════════════════ */}
      <section className="relative py-32 border-t border-white/5 overflow-hidden">
        <CanopyAmbientGlow position="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size={900} tone="full" opacity={0.18} animate />
        <div className="absolute inset-0 canopy-grid-pattern opacity-30" />

        <div className="container relative text-center max-w-3xl">
          <Reveal>
            <div className="flex justify-center mb-8">
              <CanopyLogo variant="icon" size="xl" animate />
            </div>
            <h2 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6 leading-tight">
              Plan spatially.
              <br />
              <span className="canopy-text-full-gradient">Execute flawlessly.</span>
            </h2>
            <p className="text-foreground/65 text-lg max-w-xl mx-auto mb-10">
              Every screen feels alive, connected, responsive, and spatial — because that's how
              your work really happens.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/projects">
                <Button size="lg" className="canopy-button-primary h-14 px-8">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload your first brief
                </Button>
              </Link>
              <Link to="/auth">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-14 px-8 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-foreground/90"
                >
                  Sign in
                </Button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ FOOTER ═════════════════════════════════════════════════ */}
      <footer className="border-t border-white/5">
        <div className="container py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <CanopyLogo variant="horizontal" size="sm" showByline />
          <p className="text-xs text-foreground/50">
            A spatial operating system for experiential planning.
          </p>
          <div className="flex items-center gap-5 text-sm text-foreground/60">
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link to="/projects" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
