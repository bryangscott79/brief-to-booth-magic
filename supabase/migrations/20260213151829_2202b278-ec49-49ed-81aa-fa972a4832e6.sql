
-- Knowledge base files per project
CREATE TABLE public.knowledge_base_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  extracted_text TEXT,
  file_size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_base_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own KB files"
  ON public.knowledge_base_files FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own KB files"
  ON public.knowledge_base_files FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own KB files"
  ON public.knowledge_base_files FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own KB files"
  ON public.knowledge_base_files FOR UPDATE USING (auth.uid() = user_id);

-- Company profiles (workspace-level, shared)
CREATE TABLE public.company_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_name TEXT,
  industry TEXT,
  default_booth_sizes TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own company profile"
  ON public.company_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own company profile"
  ON public.company_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own company profile"
  ON public.company_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own company profile"
  ON public.company_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_company_profiles_updated_at
  BEFORE UPDATE ON public.company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Show/venue cost database
CREATE TABLE public.show_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  show_name TEXT NOT NULL,
  city TEXT NOT NULL,
  venue TEXT,
  industry TEXT,
  estimated_booth_cost_per_sqft NUMERIC,
  estimated_drayage_per_cwt NUMERIC,
  estimated_labor_rate_per_hr NUMERIC,
  estimated_electrical_per_outlet NUMERIC,
  estimated_internet_cost NUMERIC,
  estimated_lead_retrieval_cost NUMERIC,
  badge_scan_cost NUMERIC,
  union_labor_required BOOLEAN DEFAULT false,
  notes TEXT,
  is_preset BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.show_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own and preset show costs"
  ON public.show_costs FOR SELECT USING (is_preset = true OR auth.uid() = user_id);
CREATE POLICY "Users can insert their own show costs"
  ON public.show_costs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own show costs"
  ON public.show_costs FOR UPDATE USING (auth.uid() = user_id AND is_preset = false);
CREATE POLICY "Users can delete their own show costs"
  ON public.show_costs FOR DELETE USING (auth.uid() = user_id AND is_preset = false);

CREATE TRIGGER update_show_costs_updated_at
  BEFORE UPDATE ON public.show_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for KB files
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge-base', 'knowledge-base', false);

CREATE POLICY "Users can upload KB files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'knowledge-base' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own KB files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'knowledge-base' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own KB files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'knowledge-base' AND auth.uid()::text = (storage.foldername(name))[1]);
