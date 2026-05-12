-- Create brand_guidelines table
CREATE TABLE public.brand_guidelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  color_system JSONB DEFAULT '{}',
  typography JSONB DEFAULT '{}',
  logo_rules JSONB DEFAULT '{}',
  photography_style JSONB DEFAULT '{}',
  tone_of_voice JSONB DEFAULT '{}',
  materials_finishes JSONB DEFAULT '{}',
  guidelines_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.brand_guidelines ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own brand guidelines"
ON public.brand_guidelines
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own brand guidelines"
ON public.brand_guidelines
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own brand guidelines"
ON public.brand_guidelines
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own brand guidelines"
ON public.brand_guidelines
FOR DELETE
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_brand_guidelines_updated_at
BEFORE UPDATE ON public.brand_guidelines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
