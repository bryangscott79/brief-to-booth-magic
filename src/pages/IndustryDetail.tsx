// /industries/:slug — public deep-dive page for a Canopy industry vertical.
//
// Every industry showcased on the landing links here. The page explains:
//   • what the vertical means inside Canopy
//   • the vocabulary swap (so visitors see how the platform speaks their language)
//   • the project types Canopy supports for the industry
//   • a hero render and supporting copy
//
// Pulls live data from the public `industries` table (RLS-readable for any
// authenticated user; for anonymous visitors we fall back to the constants in
// builtinIndustries.ts so the page is always renderable).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Building2,
  TreePine,
  Film,
  Speaker,
  Layers,
  CheckCircle2,
  BookOpen,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CanopyLogo, CanopyAmbientGlow } from "@/components/canopy";
import { Reveal } from "@/components/landing/Reveal";
import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_INDUSTRIES } from "@/lib/builtinIndustries";
import { cn } from "@/lib/utils";

import experientialImg from "@/assets/industry-experiential.jpg";
import architectureImg from "@/assets/industry-architecture.jpg";
import landscapeImg from "@/assets/industry-landscape.jpg";
import entertainmentImg from "@/assets/industry-entertainment.jpg";
import audioVisualImg from "@/assets/industry-audio-visual.jpg";

const HERO_BY_SLUG: Record<string, string> = {
  experiential: experientialImg,
  architecture: architectureImg,
  landscape: landscapeImg,
  entertainment: entertainmentImg,
  audio_visual: audioVisualImg,
};

const ICON_MAP: Record<string, typeof Sparkles> = {
  Sparkles,
  Building2,
  TreePine,
  Film,
  Speaker,
  Layers,
};

// What Canopy uniquely offers per vertical — long-form, copywriter voice.
// Keyed by slug so adding a new industry only requires extending this map +
// generating a hero image. Falls back to the description from the DB.
const NARRATIVE: Record<
  string,
  {
    tagline: string;
    pitch: string;
    capabilities: string[];
    deliverables: string[];
  }
> = {
  experiential: {
    tagline: "Activations that get built. Not just rendered.",
    pitch:
      "From trade show floors to brand pop-ups to festival activations — Canopy turns experiential briefs into buildable spatial responses. Every render is grounded in real materials, real labor, real budgets.",
    capabilities: [
      "Booth & activation strategy",
      "Hero rendering + 8-angle view package",
      "Interactive floor plan with zones",
      "Cost roll-up by category (build, AV, drayage, labor)",
      "Brand-compliant moodboards",
    ],
    deliverables: [
      "Pitch-ready PDF + PPTX",
      "Photoreal hero image",
      "Buildable floor plan",
      "Materials & finishes list",
    ],
  },
  architecture: {
    tagline: "Design the building before you draw the plan.",
    pitch:
      "Residential, commercial, hospitality, and civic — Canopy gives architecture studios a fast first pass. Site context, program, scale, and brand all become inputs. The output is a coherent set you can iterate on with a client in the room.",
    capabilities: [
      "Concept generation from program brief",
      "Massing studies + facade explorations",
      "Floor plan generation with zoning logic",
      "Interior + exterior render packages",
      "Code-aware spatial constraints",
    ],
    deliverables: [
      "Concept deck",
      "Photoreal exterior + interior renders",
      "Floor plans by level",
      "Materials palette",
    ],
  },
  landscape: {
    tagline: "Sites that read at every scale.",
    pitch:
      "Gardens, parks, plazas, streetscapes, restoration. Canopy understands the difference between hardscape and softscape, between native and ornamental, between programmed and ambient. Briefs in, site plans + planting palettes out.",
    capabilities: [
      "Site analysis from photos + plans",
      "Hardscape + softscape strategy",
      "Planting palette by climate zone",
      "Render at human scale (eye-level + aerial)",
      "Drainage + grading awareness",
    ],
    deliverables: [
      "Site plan",
      "Planting palette",
      "Render package",
      "Material specification",
    ],
  },
  entertainment: {
    tagline: "Sets the talent walks onto first thing in the morning.",
    pitch:
      "Film, TV, theatrical, themed entertainment, concerts. Canopy speaks the language of production design — keylight, scenic flats, sightlines, blocking. Briefs become set designs, set designs become construction-ready plans.",
    capabilities: [
      "Set design from script breakdown",
      "Stage plan + sightline analysis",
      "Lighting mood references",
      "Rigging + load awareness",
      "Day-of-shoot reference renders",
    ],
    deliverables: [
      "Set design package",
      "Stage plan",
      "Lighting moodboard",
      "Production-ready prompts",
    ],
  },
  audio_visual: {
    tagline: "Systems that disappear into the room.",
    pitch:
      "Corporate, hospitality, education, worship, residential. Canopy designs AV installs that look as good off as they do on. Equipment lists, sightline diagrams, acoustics, and integration plans — all from a scope of work.",
    capabilities: [
      "Equipment selection by room type",
      "Sightline + acoustic analysis",
      "Cable & rack layout",
      "Integrated control planning",
      "Render at install grade",
    ],
    deliverables: [
      "Equipment list & layout",
      "Sightline diagram",
      "System rendering",
      "Install schedule",
    ],
  },
};

interface PageIndustry {
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  vocabulary: Record<string, string>;
}

export default function IndustryDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [dbIndustry, setDbIndustry] = useState<PageIndustry | null>(null);
  const [projectTypes, setProjectTypes] = useState<Array<{ slug: string; label: string; description: string | null }>>([]);

  // Try to read live data from the DB (works for authenticated visitors).
  // Anonymous visitors fall back to the constants — page always renders.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      const { data } = await (supabase.from("industries" as any) as any)
        .select("slug, label, description, icon, vocabulary")
        .eq("slug", slug)
        .maybeSingle();
      if (!cancelled && data) setDbIndustry(data as PageIndustry);

      const { data: types } = await (supabase.from("activation_types" as any) as any)
        .select("slug, label, description, industries, is_builtin")
        .contains("industries", [slug])
        .eq("is_builtin", true)
        .order("label");
      if (!cancelled && Array.isArray(types)) {
        setProjectTypes(types as Array<{ slug: string; label: string; description: string | null }>);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const fallback = useMemo(() => BUILTIN_INDUSTRIES.find((b) => b.slug === slug), [slug]);

  const industry: PageIndustry | null =
    dbIndustry ??
    (fallback
      ? {
          slug: fallback.slug,
          label: fallback.label,
          description: fallback.description,
          icon: fallback.icon,
          vocabulary: fallback.vocabulary,
        }
      : null);

  if (!industry) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Industry not found</h1>
        <Link to="/">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to home
          </Button>
        </Link>
      </div>
    );
  }

  const Icon = ICON_MAP[industry.icon ?? ""] ?? Layers;
  const heroImg = HERO_BY_SLUG[industry.slug];
  const narrative = NARRATIVE[industry.slug];
  const vocab = industry.vocabulary ?? {};

  // SEO
  useEffect(() => {
    const title = `${industry.label} — Canopy`;
    document.title = title;
    const desc = narrative?.tagline ?? industry.description ?? "Canopy industry vertical";
    let m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement("meta");
      m.setAttribute("name", "description");
      document.head.appendChild(m);
    }
    m.setAttribute("content", desc);
  }, [industry.label, industry.description, narrative]);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* HEADER */}
      <header className="fixed inset-x-0 top-0 z-50 glass border-b border-white/5">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center" aria-label="Canopy home">
            <CanopyLogo variant="horizontal" size="md" showByline />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link to="/#industries" className="text-muted-foreground hover:text-foreground transition-colors">
              All industries
            </Link>
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

      {/* HERO */}
      <section className="relative min-h-[80svh] flex items-center overflow-hidden pt-24">
        {heroImg && (
          <div className="absolute inset-0" aria-hidden>
            <img
              src={heroImg}
              alt={`${industry.label} — Canopy showcase`}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.85 }}
              width={1920}
              height={1080}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-transparent to-background/40" />
          </div>
        )}
        <div className="absolute inset-0 canopy-grid-pattern opacity-20" aria-hidden />
        <CanopyAmbientGlow position="top-1/4 -left-32" size={520} tone="violet" opacity={0.22} animate />

        <div className="container relative z-10 py-16">
          <Link
            to="/#industries"
            className="inline-flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All industries
          </Link>

          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-foreground/80 backdrop-blur-sm mb-6">
              <Icon className="h-3.5 w-3.5 text-[#A78BFA]" />
              Canopy for {industry.label}
            </div>

            <h1 className="text-5xl md:text-6xl font-semibold leading-[1.05] tracking-tight mb-5">
              {narrative?.tagline ?? industry.description}
            </h1>
            <p className="text-lg text-foreground/70 leading-relaxed mb-8 max-w-xl">
              {narrative?.pitch ?? industry.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/projects">
                <Button size="lg" className="canopy-button-primary h-14 px-8 text-base">
                  Start a {(vocab.project ?? "project").toLowerCase()}
                  <ArrowRight className="ml-2 h-4 w-4" />
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
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
      </section>

      {/* VOCABULARY — show how Canopy speaks this industry's language */}
      <section className="relative py-24 border-t border-white/5">
        <div className="container">
          <Reveal className="max-w-3xl mb-12">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F472B6] mb-3">
              How Canopy speaks {industry.label}
            </div>
            <h2 className="text-4xl font-semibold tracking-tight">
              The platform learns your <span className="canopy-text-gradient">vocabulary</span>.
            </h2>
            <p className="mt-4 text-foreground/60 text-lg">
              Generic SaaS calls everything a "project" and every output a "deliverable." Canopy
              doesn't. The interface, prompts, and exports re-skin themselves to match the words
              your industry actually uses.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(vocab).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
              >
                <div className="text-[10px] uppercase tracking-widest text-foreground/45 font-mono">
                  {key.replace(/_/g, " ")}
                </div>
                <div className="mt-1.5 text-lg font-medium">{value as string}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      {narrative && (
        <section className="relative py-24 border-t border-white/5">
          <CanopyAmbientGlow position="top-0 right-0" size={500} tone="pink" opacity={0.1} />
          <div className="container">
            <Reveal className="max-w-3xl mb-12">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#A78BFA] mb-3">
                What Canopy does for {industry.label}
              </div>
              <h2 className="text-4xl font-semibold tracking-tight">
                Brief in. <span className="canopy-text-gradient">Coordinated response out.</span>
              </h2>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Compass className="h-4 w-4 text-[#A78BFA]" />
                  <h3 className="font-semibold">Capabilities</h3>
                </div>
                <ul className="space-y-2.5">
                  {narrative.capabilities.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm text-foreground/80">
                      <CheckCircle2 className="h-4 w-4 text-[#A78BFA] shrink-0 mt-0.5" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="h-4 w-4 text-[#F472B6]" />
                  <h3 className="font-semibold">What you ship</h3>
                </div>
                <ul className="space-y-2.5">
                  {narrative.deliverables.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-sm text-foreground/80">
                      <CheckCircle2 className="h-4 w-4 text-[#F472B6] shrink-0 mt-0.5" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* PROJECT TYPES */}
      {projectTypes.length > 0 && (
        <section className="relative py-24 border-t border-white/5">
          <div className="container">
            <Reveal className="max-w-3xl mb-12">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F472B6] mb-3">
                {vocab.project_types ?? "Project types"} we support
              </div>
              <h2 className="text-4xl font-semibold tracking-tight">
                {projectTypes.length} types,{" "}
                <span className="canopy-text-gradient">one engine.</span>
              </h2>
              <p className="mt-4 text-foreground/60 text-lg">
                Every {(vocab.project_type ?? "project type").toLowerCase()} ships with its own
                playbook — references, default footprint, element emphasis, and render context. Add
                your own from your agency dashboard.
              </p>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {projectTypes.map((t) => (
                <div
                  key={t.slug}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 hover:border-white/20 transition-colors"
                >
                  <div className="font-medium text-sm">{t.label}</div>
                  {t.description && (
                    <p className="text-xs text-foreground/55 mt-1 line-clamp-2">{t.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative py-28 border-t border-white/5">
        <CanopyAmbientGlow position="bottom-0 left-1/2 -translate-x-1/2" size={600} tone="violet" opacity={0.18} animate />
        <div className="container relative">
          <Reveal className="max-w-2xl mx-auto text-center">
            <Badge variant="secondary" className="mb-4">
              Built for {industry.label}
            </Badge>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-5">
              Bring us a {(vocab.brief ?? "brief").toLowerCase()}.
              <br />
              <span className="canopy-text-gradient">Take home a response.</span>
            </h2>
            <p className="text-foreground/60 text-lg mb-8">
              Sign in and start your first {(vocab.project ?? "project").toLowerCase()} — Canopy
              handles the rest.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/projects">
                <Button size="lg" className="canopy-button-primary h-14 px-8 text-base">
                  Start a {(vocab.project ?? "project").toLowerCase()}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link to="/#industries">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-14 px-8 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-foreground/90"
                >
                  See other industries
                </Button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10">
        <div className="container text-xs text-foreground/45 flex items-center justify-between flex-wrap gap-3">
          <span>© Canopy — A spatial OS for environment design.</span>
          <Link to="/" className="hover:text-foreground transition-colors">
            Back to home
          </Link>
        </div>
      </footer>
    </div>
  );
}

// Suppress unused-import warning (cn imported defensively for future variants)
void cn;
