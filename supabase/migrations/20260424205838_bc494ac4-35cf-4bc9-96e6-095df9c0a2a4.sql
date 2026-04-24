CREATE OR REPLACE FUNCTION public.set_updated_at_venue_intelligence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.venue_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_name TEXT NOT NULL,
  venue TEXT,
  city TEXT,
  industry TEXT,
  design_tips TEXT[] NOT NULL DEFAULT '{}',
  traffic_patterns TEXT,
  audience_notes TEXT,
  logistics_notes TEXT,
  booth_placement_tips TEXT,
  typical_booth_sizes TEXT[] NOT NULL DEFAULT '{}',
  union_labor_required BOOLEAN,
  source TEXT NOT NULL DEFAULT 'manual',
  source_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_venue_intelligence_user_id ON public.venue_intelligence(user_id);
CREATE INDEX idx_venue_intelligence_show_name ON public.venue_intelligence(show_name);

ALTER TABLE public.venue_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own venue intelligence"
  ON public.venue_intelligence FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can create their own venue intelligence"
  ON public.venue_intelligence FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own venue intelligence"
  ON public.venue_intelligence FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can delete their own venue intelligence"
  ON public.venue_intelligence FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER set_venue_intelligence_updated_at
  BEFORE UPDATE ON public.venue_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_venue_intelligence();