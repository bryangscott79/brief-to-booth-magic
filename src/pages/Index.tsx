import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Upload,
  Sparkles,
  Grid3X3,
  FileText,
  Download,
  ArrowRight,
  Zap,
  Target,
  Palette,
  CheckCircle2,
  Clock,
  Users,
  BarChart3,
  ChevronRight,
  Play,
} from "lucide-react";
import heroImage from "@/assets/hero-visualization.jpg";

const WORKFLOW_STEPS = [
  {
    number: "01",
    label: "Upload Brief",
    detail: "PDF, DOCX, or paste text",
    icon: Upload,
    color: "hsl(38 92% 50%)",
  },
  {
    number: "02",
    label: "Parse & Review",
    detail: "AI extracts brand, budget, spatial needs",
    icon: Target,
    color: "hsl(200 85% 55%)",
  },
  {
    number: "03",
    label: "Generate Elements",
    detail: "8 coordinated strategic elements",
    icon: Sparkles,
    color: "hsl(280 75% 60%)",
  },
  {
    number: "04",
    label: "Plan Spatially",
    detail: "Interactive floor plan + layout AI",
    icon: Grid3X3,
    color: "hsl(150 70% 45%)",
  },
  {
    number: "05",
    label: "Build Prompts",
    detail: "8-angle render prompt suite",
    icon: FileText,
    color: "hsl(38 92% 50%)",
  },
  {
    number: "06",
    label: "Export Package",
    detail: "Complete client-ready delivery",
    icon: Download,
    color: "hsl(200 85% 55%)",
  },
];

const CAPABILITIES = [
  {
    icon: Sparkles,
    title: "8 Strategic Elements",
    description:
      "Big Idea, Experience Framework, Interactive Mechanics, Digital Storytelling, Human Connection, Adjacent Activations, Spatial Strategy, Budget Logic — all generated in unison.",
    badge: "AI-powered",
  },
  {
    icon: Grid3X3,
    title: "Intelligent Floor Planning",
    description:
      "AI-generated 2D architectural renders, zone blocking, traffic flow analysis, constraint validation, and cost estimation — all in one spatial canvas.",
    badge: "Live rendering",
  },
  {
    icon: Palette,
    title: "Brand-True Renders",
    description:
      "Human-in-the-loop ingredient editor ensures your brand colors, materials, and structural notes feed precisely into every render prompt.",
    badge: "Visual fidelity",
  },
  {
    icon: FileText,
    title: "Render Prompt Suites",
    description:
      "8 coordinated camera angles with consistency tokens. Structured for Midjourney, DALL-E, and direct-to-3D pipelines like Meshy or Rodin.",
    badge: "3D-ready",
  },
  {
    icon: BarChart3,
    title: "Spatial Intelligence",
    description:
      "Flow efficiency scoring, zone engagement predictions, ADA compliance checks, traffic simulation, and live cost estimation by quality tier.",
    badge: "Data-driven",
  },
  {
    icon: Download,
    title: "Full-Package Export",
    description:
      "Proposal decks, markdown strategy docs, JSON data, SVG floor plans, and packaged render prompts — everything a client or fabricator needs.",
    badge: "Delivery-ready",
  },
];

const STATS = [
  { value: "24hrs", label: "Brief to full proposal" },
  { value: "8×", label: "Strategic elements generated" },
  { value: "∞", label: "Layout variations explored" },
  { value: "100%", label: "Brand-consistent output" },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-[0_0_16px_hsl(38_92%_50%/0.4)]">
              <Layers className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              BriefEngine
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Capabilities
            </a>
            <Link to="/auth">
              <Button size="sm" variant="outline" className="mr-2">
                Sign In
              </Button>
            </Link>
            <Link to="/projects">
              <Button size="sm" className="btn-glow">
                Start Free
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden hero-gradient pt-16">
        {/* Ambient glow blobs */}
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-500/6 blur-[100px] pointer-events-none" />

        {/* Full-bleed hero image */}
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="AI-generated trade show booth"
            className="w-full h-full object-cover object-center opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,8%)/0.3] via-transparent to-[hsl(220,25%,8%)]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220,25%,8%)/0.6] via-transparent to-[hsl(220,25%,8%)/0.3]" />
        </div>

        <div className="container relative z-10 py-32">
          <div className="max-w-4xl">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/8 text-primary text-sm font-medium mb-8 backdrop-blur-sm animate-fade-in">
              <Zap className="h-3.5 w-3.5" />
              For experiential agencies & exhibit designers
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.05] mb-6 animate-slide-up">
              From RFP brief
              <br />
              to{" "}
              <span className="hero-text-gradient">render-ready</span>
              <br />
              in one day.
            </h1>

            {/* Sub */}
            <p className="text-lg md:text-xl text-white/65 max-w-2xl mb-10 leading-relaxed animate-slide-up">
              BriefEngine parses your client brief, generates 8 coordinated strategic
              elements, builds an interactive floor plan, and outputs a full render prompt
              suite — all in a single, guided workflow.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 animate-slide-up">
              <Link to="/projects">
                <Button size="lg" className="btn-glow text-base px-8 h-14 rounded-xl">
                  <Upload className="mr-2 h-5 w-5" />
                  Upload Your First Brief
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button
                  size="lg"
                  variant="secondary"
                  className="text-base px-8 h-14 rounded-xl bg-white/15 border border-white/25 text-white hover:bg-white/25 backdrop-blur-sm"
                >
                  <Play className="mr-2 h-4 w-4" />
                  See How It Works
                </Button>
              </a>
            </div>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-10 text-white/40 text-sm">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary/70" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary/70" />
                Works with PDF, DOCX & plain text
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary/70" />
                Export-ready output
              </span>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ── Stats Bar ───────────────────────────────── */}
      <section className="py-14 bg-card border-y border-border">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-4xl md:text-5xl font-bold hero-text-gradient mb-1">
                  {s.value}
                </div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────── */}
      <section id="how-it-works" className="py-28 bg-background">
        <div className="container">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
              The Workflow
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Six steps. One cohesive proposal.
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Every step feeds the next. Nothing siloed, everything coordinated.
            </p>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="hidden lg:block absolute top-[52px] left-[calc(8.33%+28px)] right-[calc(8.33%+28px)] h-px bg-gradient-to-r from-transparent via-border to-transparent" />

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={step.number} className="flex flex-col items-center text-center gap-4 group">
                  {/* Step circle */}
                  <div
                    className="relative flex h-[56px] w-[56px] items-center justify-center rounded-full border-2 bg-card shadow-lg transition-transform group-hover:-translate-y-1"
                    style={{ borderColor: step.color }}
                  >
                    <step.icon className="h-5 w-5" style={{ color: step.color }} />
                    <div
                      className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-background"
                      style={{ backgroundColor: step.color }}
                    >
                      {i + 1}
                    </div>
                  </div>
                  <div>
                    <div className="font-semibold text-sm mb-1">{step.label}</div>
                    <div className="text-xs text-muted-foreground leading-snug">{step.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 flex justify-center">
            <Link to="/projects">
              <Button size="lg" className="btn-glow rounded-xl px-8 h-12">
                Start the Workflow
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Capabilities ────────────────────────────── */}
      <section id="capabilities" className="py-28 bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
              Built for the Industry
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Everything your pitch needs.
              <br />
              <span className="hero-text-gradient">Nothing it doesn't.</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Purpose-built for trade show design agencies. No generic AI fluff.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map((cap, i) => (
              <div
                key={i}
                className="element-card rounded-2xl p-7 group hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <cap.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 bg-primary/8 px-2.5 py-1 rounded-full border border-primary/20">
                    {cap.badge}
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-3">{cap.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{cap.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── "Who It's For" callout ───────────────────── */}
      <section className="py-28 bg-background overflow-hidden">
        <div className="container">
          <div className="relative rounded-3xl overflow-hidden border border-border">
            {/* Background image */}
            <div className="absolute inset-0">
              <img
                src={heroImage}
                alt=""
                className="w-full h-full object-cover opacity-15"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
            </div>

            <div className="relative grid md:grid-cols-2 gap-12 items-center p-12 md:p-16">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-6">
                  Built for Professionals
                </div>
                <h2 className="text-4xl font-bold leading-tight mb-6">
                  Stop reinventing the wheel on every RFP.
                </h2>
                <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                  BriefEngine captures your agency's strategy, spatial thinking, and visual
                  language — and applies it consistently across every brief, every time.
                </p>
                <ul className="space-y-3 mb-10">
                  {[
                    "Brand color-accurate floor plan renders",
                    "Spatial constraint & ADA validation built in",
                    "Multi-footprint scaling from a single brief",
                    "Human review at every AI generation step",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/projects">
                  <Button size="lg" className="btn-glow rounded-xl px-8 h-12">
                    Upload a Brief
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {/* Right side stats */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Clock, label: "Hours to first proposal", value: "< 24" },
                  { icon: Layers, label: "Strategic elements", value: "8" },
                  { icon: BarChart3, label: "Layout variations", value: "∞" },
                  { icon: Users, label: "Angles per project", value: "8+" },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="element-card rounded-2xl p-5 text-center"
                  >
                    <s.icon className="h-6 w-6 text-primary mx-auto mb-3" />
                    <div className="text-3xl font-bold mb-1 hero-text-gradient">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────── */}
      <section className="py-28 hero-gradient relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(38_92%_50%/0.12),transparent_60%)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <div className="container relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 text-primary text-xs font-semibold uppercase tracking-wider mb-6 border border-primary/20">
            Get Started Today
          </div>
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Your next award-winning booth
            <br />
            <span className="hero-text-gradient">starts with one brief.</span>
          </h2>
          <p className="text-white/60 text-lg max-w-xl mx-auto mb-10">
            Upload your RFP and watch BriefEngine transform it into a complete,
            coordinated design response — ready to present.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/projects">
              <Button
                size="lg"
                className="btn-glow text-base px-10 h-14 rounded-xl"
              >
                <Upload className="mr-2 h-5 w-5" />
                Upload Your First Brief
              </Button>
            </Link>
            <Link to="/auth">
              <Button
                size="lg"
                variant="outline"
                className="text-base px-10 h-14 rounded-xl border-white/20 text-white/80 hover:text-white hover:bg-white/5"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="py-10 border-t border-border bg-background">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-sm">BriefEngine</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Purpose-built for experiential agencies. Powered by AI.
          </p>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
            <Link to="/projects" className="hover:text-foreground transition-colors">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
