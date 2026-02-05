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
  Palette
} from "lucide-react";
import heroImage from "@/assets/hero-visualization.jpg";

export default function Index() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Layers className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              BriefEngine
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            <Link to="/projects" className="text-sm text-white/70 hover:text-white transition-colors">
              Projects
            </Link>
            <Link to="/auth">
              <Button size="sm" className="btn-glow">
                Sign In
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-gradient relative overflow-hidden min-h-[90vh] flex items-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(38_92%_50%/0.15),transparent_50%)]" />
        
        {/* Hero Image */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30 md:opacity-50">
          <img 
            src={heroImage} 
            alt="Trade show booth visualization" 
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[hsl(220,25%,8%)] via-transparent to-[hsl(220,25%,8%)/0.5]" />
        </div>
        
        <div className="container relative py-24 md:py-32">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium backdrop-blur-sm">
              <Zap className="h-4 w-4" />
              Trade Show Intelligence
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white text-balance">
              Brief to Booth in{" "}
              <span className="hero-text-gradient">24 Hours</span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto text-balance">
              Upload your RFP. Generate strategic responses, spatial layouts, and AI render prompts — 
              all coordinated for seamless 3D model creation.
            </p>
            
            <div className="flex justify-center pt-4">
              <Link to="/projects">
                <Button size="lg" className="btn-glow text-base px-8">
                  <Upload className="mr-2 h-5 w-5" />
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Complete Response Pipeline</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From brief intake to render-ready prompts, every step is connected
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Upload,
                title: "Brief Parsing",
                description: "Upload PDF, DOCX, or paste text. AI extracts brand, objectives, spatial requirements, and creative constraints.",
              },
              {
                icon: Sparkles,
                title: "8 Strategic Elements",
                description: "Big Idea, Experience Framework, Interactive Mechanics, Storytelling, Human Connection, Adjacent Activations, Spatial Strategy, Budget Logic.",
              },
              {
                icon: Grid3X3,
                title: "Spatial Planning",
                description: "Interactive floor plans with zone visualization. Automatic scaling between footprint sizes.",
              },
              {
                icon: FileText,
                title: "Render Prompts",
                description: "8 coordinated angles with consistency tokens. Optimized for Nano Banana and AI image generators.",
              },
              {
                icon: Palette,
                title: "3D Model Ready",
                description: "Multi-angle reference images for Meshy, Rodin, or Tripo3D. Complete Rhino import workflow.",
              },
              {
                icon: Download,
                title: "Full Export",
                description: "Markdown docs, SVG floor plans, JSON data, and render prompts. Everything organized for delivery.",
              },
            ].map((feature, i) => (
              <div key={i} className="element-card p-6 rounded-xl">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Flow */}
      <section className="py-20 bg-muted/50">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
            {[
              { step: 1, label: "Upload Brief", icon: Upload },
              { step: 2, label: "Review & Edit", icon: Target },
              { step: 3, label: "Generate Elements", icon: Sparkles },
              { step: 4, label: "Plan Spatial", icon: Grid3X3 },
              { step: 5, label: "Create Prompts", icon: FileText },
              { step: 6, label: "Export Package", icon: Download },
            ].map((item, i, arr) => (
              <div key={item.step} className="flex items-center">
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-card border border-border shadow-sm">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <ArrowRight className="h-5 w-5 text-muted-foreground mx-2 hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <h2 className="text-3xl font-bold">Ready to Transform Your Response Process?</h2>
            <p className="text-muted-foreground">
              Stop spending weeks on RFP responses. Generate comprehensive, 
              visually-coordinated proposals in a single day.
            </p>
            <Link to="/projects">
              <Button size="lg" className="btn-glow">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span className="font-semibold">BriefEngine</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for experiential agencies. Powered by AI.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
