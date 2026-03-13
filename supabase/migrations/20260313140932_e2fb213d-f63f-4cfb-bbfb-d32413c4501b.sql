
-- ─── CLIENTS TABLE ────────────────────────────────────────────────────────────
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  description TEXT,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clients" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own clients" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own clients" ON public.clients FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── BRAND INTELLIGENCE TABLE ─────────────────────────────────────────────────
CREATE TABLE public.brand_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'visual_identity',
    'strategic_voice',
    'vendor_material',
    'process_procedure',
    'cost_benchmark',
    'past_learning'
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_extracted', 'feedback')),
  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 1),
  source_project_id UUID,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own brand intelligence" ON public.brand_intelligence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert brand intelligence" ON public.brand_intelligence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their brand intelligence" ON public.brand_intelligence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their brand intelligence" ON public.brand_intelligence FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_brand_intelligence_updated_at BEFORE UPDATE ON public.brand_intelligence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_brand_intelligence_client_id ON public.brand_intelligence(client_id);
CREATE INDEX idx_brand_intelligence_category ON public.brand_intelligence(category);

-- ─── PROJECT TYPE CONFIGS ──────────────────────────────────────────────────────
CREATE TABLE public.project_type_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_type_id TEXT NOT NULL,
  label TEXT,
  tagline TEXT,
  description TEXT,
  render_context TEXT,
  element_overrides JSONB,
  cost_category_overrides JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, project_type_id)
);

ALTER TABLE public.project_type_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own project type configs" ON public.project_type_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own project type configs" ON public.project_type_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own project type configs" ON public.project_type_configs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own project type configs" ON public.project_type_configs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_project_type_configs_updated_at BEFORE UPDATE ON public.project_type_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── ADD CLIENT FK TO PROJECTS ────────────────────────────────────────────────
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX idx_projects_client_id ON public.projects(client_id);
