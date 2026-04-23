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
  ChevronLeft,
  Play,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import canopyMark from "@/assets/canopy-mark.png";
import heroBoothImage from "@/assets/hero-visualization.jpg";
import heroActivationImage from "@/assets/hero-activation.jpg";
import heroInstallationImage from "@/assets/hero-installation.jpg";
import heroPremiere from "@/assets/hero-premiere.jpg";
import heroGaming from "@/assets/hero-gaming.jpg";
import heroArchitecture from "@/assets/hero-architecture.jpg";

const HERO_SLIDES = [
  {
    image: heroBoothImage,
    eyebrow: "Trade Show Booths",
    headline: "From RFP brief to render-ready in one day.",
    sub: "Parse any booth brief, generate 8 strategic elements, build an interactive floor plan, and output a complete render prompt suite.",
    accent: "hsl(38 92% 50%)",
  },
  {
    image: heroActivationImage,
    eyebrow: "Live Brand Activations",
    headline: "Design brand moments that earn headlines.",
    sub: "Turn a single activation brief into a fully coordinated strategy — immersive spatial design, earned media hooks, and production-ready concepts.",
    accent: "hsl(200 85% 55%)",
  },
  {
    image: heroInstallationImage,
    eyebrow: "Permanent Installations",
    headline: "Spaces that tell your story every single day.",
    sub: "From flagship retail to museum installs — generate architectural narrative, material palettes, CMS strategy, and CapEx models in one workflow.",
    accent: "hsl(150 70% 45%)",
  },
  {
    image: heroPremiere,
    eyebrow: "Film & Event Premieres",
    headline: "Concept builds that create cultural moments.",
    sub: "Design red carpet experiences, theatrical set-piece builds, and talent staging concepts that generate press coverage and fan excitement.",
    accent: "hsl(45 95% 58%)",
  },
  {
    image: heroGaming,
    eyebrow: "Game Release Activations",
    headline: "Launch events as epic as the games.",
    sub: "From esports arenas to world-building pop-ups — generate playable demo architecture, streaming infrastructure, and community programming strategies.",
    accent: "hsl(280 75% 60%)",
  },
  {
    image: heroArchitecture,
    eyebrow: "Architectural Briefs",
    headline: "Concept to construction-ready intelligence.",
    sub: "Parse architectural briefs and generate design concept, program schedule, sustainability strategy, and elemental cost plans instantly.",
    accent: "hsl(200 60% 50%)",
  },
];

const WORKFLOW_STEPS = [
  { number: "01", label: "Choose Project Type", detail: "Booth, activation, film, gaming, architecture", icon: Sparkles, color: "hsl(280 75% 60%)" },
  { number: "02", label: "Upload Brief", detail: "PDF, DOCX, or paste text", icon: Upload, color: "hsl(38 92% 50%)" },
  { number: "03", label: "Parse & Review", detail: "AI extracts brand, budget, spatial needs", icon: Target, color: "hsl(200 85% 55%)" },
  { number: "04", label: "Generate Elements", detail: "Type-specific strategic elements", icon: Sparkles, color: "hsl(150 70% 45%)" },
  { number: "05", label: "Plan Spatially", detail: "Interactive floor plan + layout AI", icon: Grid3X3, color: "hsl(45 95% 58%)" },
  { number: "06", label: "Export Package", detail: "Pitch deck, prompts, cost model", icon: Download, color: "hsl(200 85% 55%)" },
];

const CAPABILITIES = [
  {
    icon: Sparkles,
    title: "Type-Adaptive Strategy",
    description: "Each project type unlocks its own set of strategic elements — a Film Premiere gets Narrative Arc, Talent Staging, and PR Moments. A Trade Show gets Interactive Mechanics and Adjacent Activations.",
    badge: "AI-powered",
  },
  {
    icon: Grid3X3,
    title: "Intelligent Spatial Planning",
    description: "AI-generated 2D architectural renders, zone blocking, traffic flow analysis, and constraint validation — adapted to the spatial language of each project type.",
    badge: "Live rendering",
  },
  {
    icon: Palette,
    title: "Brand-True Renders",
    description: "Human-in-the-loop ingredient editor ensures your brand colors, materials, and structural notes feed precisely into every render prompt across all project types.",
    badge: "Visual fidelity",
  },
  {
    icon: BarChart3,
    title: "Real-Time Cost Intelligence",
    description: "Type-specific cost frameworks with vendor line items, market-rate AI estimates, and web-researched pricing — so every pitch includes a defensible production budget.",
    badge: "Cost-aware",
  },
  {
    icon: FileText,
    title: "Render Prompt Suites",
    description: "8 coordinated camera angles with consistency tokens. Structured for Midjourney, DALL-E, and direct-to-3D pipelines like Meshy or Rodin. Context-tuned per project type.",
    badge: "3D-ready",
  },
  {
    icon: Download,
    title: "Full-Package Export",
    description: "Proposal decks, strategy docs, JSON data, floor plans, and packaged render prompts — everything a client, fabricator, or production company needs to move forward.",
    badge: "Delivery-ready",
  },
];

const PROJECT_TYPES_PREVIEW = [
  { icon: "🏛️", label: "Trade Show Booth", color: "hsl(38 92% 50%)" },
  { icon: "⚡", label: "Brand Activation", color: "hsl(200 85% 55%)" },
  { icon: "🏗️", label: "Permanent Install", color: "hsl(150 70% 45%)" },
  { icon: "🎬", label: "Film Premiere", color: "hsl(45 95% 58%)" },
  { icon: "🎮", label: "Game Launch", color: "hsl(280 75% 60%)" },
  { icon: "🏢", label: "Architecture", color: "hsl(200 60% 50%)" },
];

export default function Index() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goToSlide = useCallback((index: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlide(index);
      setIsTransitioning(false);
    }, 300);
  }, [isTransitioning]);

  const nextSlide = useCallback(() => {
    goToSlide((currentSlide + 1) % HERO_SLIDES.length);
  }, [currentSlide, goToSlide]);

  const prevSlide = useCallback(() => {
    goToSlide((currentSlide - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  }, [currentSlide, goToSlide]);

  // Auto-advance every 6 seconds
  useEffect(() => {
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [nextSlide]);

  const slide = HERO_SLIDES[currentSlide];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-border">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" aria-label="Canopy" className="flex items-center">
            <img src={canopyMark} alt="Canopy" className="h-9 w-9 object-contain" />
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Capabilities
            </a>
            <Link to="/auth">
              <Button size="sm" variant="outline" className="mr-2">Sign In</Button>
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

      {/* ── Hero Rotator ────────────────────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden hero-gradient pt-16">
        {/* Ambient glow */}
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none transition-colors duration-1000"
          style={{ backgroundColor: `${slide.accent}15` }}
        />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-blue-500/6 blur-[100px] pointer-events-none" />

        {/* Slides */}
        {HERO_SLIDES.map((s, i) => (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === currentSlide && !isTransitioning ? 1 : 0 }}
          >
            <img
              src={s.image}
              alt={s.eyebrow}
              className="w-full h-full object-cover object-center opacity-35"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,25%,8%)]/30 via-transparent to-[hsl(220,25%,8%)]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220,25%,8%)]/70 via-transparent to-[hsl(220,25%,8%)]/30" />
          </div>
        ))}

        <div className="container relative z-10 py-32">
          <div className="max-w-4xl">
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium mb-8 backdrop-blur-sm animate-fade-in transition-all duration-500"
              style={{
                borderColor: `${slide.accent}50`,
                backgroundColor: `${slide.accent}15`,
                color: slide.accent,
              }}
            >
              <Zap className="h-3.5 w-3.5" />
              {slide.eyebrow}
            </div>

            {/* Headline */}
            <h1
              className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.05] mb-6 transition-opacity duration-300"
              style={{ opacity: isTransitioning ? 0 : 1 }}
            >
              {slide.headline.split(" to ").map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>
                    {part} to{" "}
                    <span style={{ color: slide.accent }} className="transition-colors duration-500">
                      {arr[i + 1].split(" ").slice(0, 2).join(" ")}
                    </span>{" "}
                    {arr[i + 1].split(" ").slice(2).join(" ")}
                  </span>
                ) : i === 0 ? <span key={i}>{part}</span> : null
              )}
              {!slide.headline.includes(" to ") && slide.headline}
            </h1>

            {/* Sub */}
            <p
              className="text-lg md:text-xl text-white/65 max-w-2xl mb-10 leading-relaxed transition-opacity duration-300"
              style={{ opacity: isTransitioning ? 0 : 1 }}
            >
              {slide.sub}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/projects">
                <Button
                  size="lg"
                  className="text-base px-8 h-14 rounded-xl transition-all duration-500"
                  style={{
                    background: `linear-gradient(135deg, ${slide.accent}, hsl(38 92% 38%))`,
                    boxShadow: `0 0 24px ${slide.accent}50`,
                  }}
                >
                  <Upload className="mr-2 h-5 w-5" />
                  Start Your Project
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
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: slide.accent }} />
                6 project types supported
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: slide.accent }} />
                PDF, DOCX & plain text briefs
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: slide.accent }} />
                Export-ready proposals
              </span>
            </div>
          </div>
        </div>

        {/* Slide controls */}
        <div className="absolute bottom-24 left-0 right-0 z-20">
          <div className="container flex items-center justify-between">
            {/* Dots */}
            <div className="flex items-center gap-2">
              {HERO_SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToSlide(i)}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === currentSlide ? "24px" : "8px",
                    height: "8px",
                    backgroundColor: i === currentSlide ? slide.accent : "rgba(255,255,255,0.3)",
                  }}
                />
              ))}
            </div>

            {/* Arrows */}
            <div className="flex items-center gap-2">
              <button
                onClick={prevSlide}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={nextSlide}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-colors backdrop-blur-sm"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ── Project Types Strip ──────────────────────── */}
      <section className="py-10 bg-card border-y border-border">
        <div className="container">
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-2">
              Built for
            </span>
            {PROJECT_TYPES_PREVIEW.map((t) => (
              <div
                key={t.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium"
                style={{ borderColor: `${t.color}40`, color: t.color, backgroundColor: `${t.color}10` }}
              >
                <span>{t.icon}</span>
                {t.label}
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
              Every step feeds the next — strategy flows into space, space flows into renders, renders flow into pitch decks.
            </p>
          </div>

          <div className="relative">
            <div className="hidden lg:block absolute top-[52px] left-[calc(8.33%+28px)] right-[calc(8.33%+28px)] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {WORKFLOW_STEPS.map((step, i) => (
                <div key={step.number} className="flex flex-col items-center text-center gap-4 group">
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
              Platform Capabilities
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              One platform.
              <br />
              <span className="hero-text-gradient">Every type of brief.</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Purpose-built for experiential agencies, architects, and production companies. Deep intelligence, not generic AI fluff.
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

      {/* ── "Built for pros" callout ─────────────────── */}
      <section className="py-28 bg-background overflow-hidden">
        <div className="container">
          <div className="relative rounded-3xl overflow-hidden border border-border">
            <div className="absolute inset-0">
              <img src={heroBoothImage} alt="" className="w-full h-full object-cover opacity-15" />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
            </div>

            <div className="relative grid md:grid-cols-2 gap-12 items-center p-12 md:p-16">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-6">
                  Built for Professionals
                </div>
                <h2 className="text-4xl font-bold leading-tight mb-6">
                  Stop reinventing the wheel on every pitch.
                </h2>
                <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
                  Canopy captures your agency's strategy, spatial thinking, and visual
                  language — and applies it consistently across every brief type, every time.
                </p>
                <ul className="space-y-3 mb-10">
                  {[
                    "Type-specific strategic elements for every discipline",
                    "Brand-accurate spatial renders across all project types",
                    "Real-time cost intelligence with vendor line items",
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
                    Start a Project
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Clock, label: "Hours to first proposal", value: "< 24" },
                  { icon: Layers, label: "Project types supported", value: "6+" },
                  { icon: BarChart3, label: "Strategic elements per type", value: "8" },
                  { icon: Users, label: "Render angles per project", value: "8+" },
                ].map((s) => (
                  <div key={s.label} className="element-card rounded-2xl p-5 text-center">
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
            Your next award-winning project
            <br />
            <span className="hero-text-gradient">starts with one brief.</span>
          </h2>
          <p className="text-white/60 text-lg max-w-xl mx-auto mb-10">
            Upload any brief — booth, activation, premiere, or architectural — and watch Canopy
            transform it into a complete, coordinated design response.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/projects">
              <Button size="lg" className="btn-glow text-base px-10 h-14 rounded-xl">
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
          <div className="flex items-center">
            <img src={canopyMark} alt="Canopy" className="h-10 w-10 object-contain" />
          </div>
          <p className="text-sm text-muted-foreground">
            The experiential design intelligence platform. Powered by AI.
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
