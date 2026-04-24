import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Sparkles,
  Network,
  Compass,
  CheckCircle2,
  Upload,
  Wand2,
  Grid3X3,
  Download,
  Target,
  FileText,
  Boxes,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CanopyLogo,
  CanopyNodeField,
  CanopyAmbientGlow,
  CanopyPanel,
} from "@/components/canopy";
import { cn } from "@/lib/utils";

// ─── CONTENT ──────────────────────────────────────────────────────────────

const PILLARS = [
  {
    icon: Network,
    title: "Spatial intelligence",
    copy: "Every object, client, and project is a node in a living graph. Canopy learns your agency's DNA once — then applies it everywhere.",
  },
  {
    icon: BookOpen,
    title: "Layered knowledge",
    copy: "Four RAG scopes — agency, activation type, client, and project — stack automatically so every generation is grounded in the right context.",
  },
  {
    icon: Wand2,
    title: "Claude skills built-in",
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
  { n: "03", label: "Ground", detail: "Pull relevant chunks from the agency + client KB.", icon: BookOpen },
  { n: "04", label: "Generate", detail: "Strategic elements, hero visual, 8 view angles.", icon: Sparkles },
  { n: "05", label: "Plan", detail: "Interactive floor plan with activation zones.", icon: Grid3X3 },
  { n: "06", label: "Deliver", detail: "Pitch deck + prompt suite + cost intelligence.", icon: Download },
];

const STATS = [
  { value: "< 24h", label: "From brief to first render" },
  { value: "4", label: "Knowledge scopes per generation" },
  { value: "15+", label: "Activation types supported" },
  { value: "8", label: "Render angles per project" },
];

const CAPABILITIES = [
  {
    icon: Boxes,
    title: "Agency-scoped tenancy",
    copy: "Every agency gets a clean multi-tenant workspace. Owners invite team members with scoped roles — admin, member, viewer.",
  },
  {
    icon: FileText,
    title: "4-scope RAG engine",
    copy: "pgvector-backed hybrid search blends agency, activation type, client, and project knowledge into every prompt — with typed citations.",
  },
  {
    icon: Sparkles,
    title: "Activation type playbooks",
    copy: "Define what a “Demo Station” or “VIP Lounge” means to your agency — templates, must-haves, reference material — and train the AI on it.",
  },
  {
    icon: ShieldCheck,
    title: "Brand compliance at the prompt",
    copy: "Generated designs are audited against each client's brand guidelines before they leave the system. Verdicts come back as pass / warn / fail.",
  },
];

// ─── PAGE ─────────────────────────────────────────────────────────────────

export default function Index() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
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
            <a href="#system" className="text-muted-foreground hover:text-foreground transition-colors">
              The system
            </a>
            <a href="#workflow" className="text-muted-foreground hover:text-foreground transition-colors">
              Workflow
            </a>
            <a href="#capabilities" className="text-muted-foreground hover:text-foreground transition-colors">
              Capabilities
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
      <section className="relative min-h-[100svh] flex items-center">
        {/* Grid under everything */}
        <div className="absolute inset-0 canopy-grid-pattern opacity-60" aria-hidden />

        {/* Ambient glows */}
        <CanopyAmbientGlow position="top-1/4 -left-32" size={520} tone="violet" opacity={0.32} animate />
        <CanopyAmbientGlow position="bottom-0 right-0 translate-x-1/3 translate-y-1/3" size={600} tone="pink" opacity={0.28} animate />

        {/* Interactive node field on the RIGHT half */}
        <div className="absolute inset-y-0 right-0 w-full md:w-1/2">
          <CanopyNodeField count={12} interactive showCanopyStructure />
        </div>

        {/* Copy on the LEFT half */}
        <div className="container relative z-10 pt-24 pb-16">
          <div className="max-w-2xl">
            {/* Eyebrow */}
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur-sm mb-8 transition-all duration-700",
                mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2",
              )}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#A78BFA] to-[#F472B6] animate-canopy-pulse" />
              A spatial operating system for experiential planning
            </div>

            {/* Headline */}
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

            {/* Sub */}
            <p
              className={cn(
                "text-lg md:text-xl text-foreground/70 leading-relaxed mb-10 max-w-xl transition-all duration-700 delay-200",
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
              )}
            >
              Canopy turns a brief into a coordinated spatial response — grounded in your agency's
              playbooks, your client's brand, and every past project you've ever shipped.
            </p>

            {/* CTAs */}
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
              <a href="#system">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-14 px-8 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-foreground/90"
                >
                  Explore the system
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>

            {/* Trust strip */}
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
                Claude skills on every upload
              </span>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      </section>

      {/* ═══ PILLARS (system overview) ══════════════════════════════ */}
      <section id="system" className="relative py-28">
        <CanopyAmbientGlow position="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size={800} tone="sky" opacity={0.12} />

        <div className="container relative">
          <div className="max-w-3xl mb-16">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A78BFA] mb-3">
              The system
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Not another dashboard.
              <br />
              <span className="canopy-text-gradient">A living interface for spatial work.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {PILLARS.map((pillar) => (
              <CanopyPanel
                key={pillar.title}
                interactive
                padded
                className="group relative overflow-hidden"
              >
                {/* Corner gradient pip */}
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
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WORKFLOW ═══════════════════════════════════════════════ */}
      <section id="workflow" className="relative py-28 border-y border-white/5">
        <div className="absolute inset-0 canopy-grid-pattern opacity-40" />

        <div className="container relative">
          <div className="max-w-2xl mx-auto text-center mb-20">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6FA8FF] mb-3">
              The workflow
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
              Six connected steps.
              <br />
              <span className="canopy-text-gradient">One coordinated output.</span>
            </h2>
            <p className="text-foreground/60 text-lg">
              Each step feeds the next — strategy flows into space, space flows into renders, renders flow into the deck.
            </p>
          </div>

          {/* Node-style workflow graph */}
          <div className="relative max-w-5xl mx-auto">
            {/* Connection line */}
            <div
              className="hidden lg:block absolute top-[26px] left-[8%] right-[8%] h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.35), rgba(244,114,182,0.35), transparent)" }}
              aria-hidden
            />

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-3">
              {WORKFLOW.map((step, i) => (
                <div key={step.n} className="flex flex-col items-center text-center group">
                  {/* Node */}
                  <div className="relative mb-4">
                    <div
                      className="w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                      style={{ background: "var(--gradient-canopy)" }}
                    >
                      <div className="absolute inset-[3px] rounded-full bg-background flex items-center justify-center">
                        <step.icon className="h-5 w-5 text-[#A78BFA]" />
                      </div>
                    </div>
                    <div
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-background border border-white/10 flex items-center justify-center text-[9px] font-mono font-semibold text-foreground/80"
                    >
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
          </div>

          <div className="mt-16 flex justify-center">
            <Link to="/projects">
              <Button size="lg" className="canopy-button-primary h-14 px-8">
                Start the workflow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ STATS STRIP ════════════════════════════════════════════ */}
      <section className="relative py-16">
        <CanopyAmbientGlow position="top-1/2 left-1/4 -translate-y-1/2" size={400} tone="violet" opacity={0.15} />

        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((stat) => (
              <CanopyPanel key={stat.label} padded className="text-center">
                <div className="text-4xl md:text-5xl font-semibold canopy-text-gradient mb-2">
                  {stat.value}
                </div>
                <div className="text-xs uppercase tracking-widest text-foreground/55">
                  {stat.label}
                </div>
              </CanopyPanel>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CAPABILITIES ═══════════════════════════════════════════ */}
      <section id="capabilities" className="relative py-28 border-t border-white/5">
        <CanopyAmbientGlow position="bottom-0 right-1/4 translate-y-1/4" size={600} tone="pink" opacity={0.15} />

        <div className="container relative">
          <div className="max-w-3xl mb-16">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F472B6] mb-3">
              Capabilities
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Built on real infrastructure.
              <br />
              <span className="canopy-text-gradient">Not a prompt wrapper.</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {CAPABILITIES.map((cap) => (
              <CanopyPanel key={cap.title} interactive padded className="group relative overflow-hidden">
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
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═════════════════════════════════════════════ */}
      <section className="relative py-32 border-t border-white/5 overflow-hidden">
        <CanopyAmbientGlow position="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" size={900} tone="full" opacity={0.18} animate />
        <div className="absolute inset-0 canopy-grid-pattern opacity-30" />

        <div className="container relative text-center max-w-3xl">
          <div className="flex justify-center mb-8">
            <CanopyLogo variant="icon" size="xl" animate />
          </div>
          <h2 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6 leading-tight">
            Plan spatially.
            <br />
            <span className="canopy-text-full-gradient">Execute flawlessly.</span>
          </h2>
          <p className="text-foreground/65 text-lg max-w-xl mx-auto mb-10">
            Every screen feels alive, connected, responsive, and spatial — because that's how your
            work really happens.
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
