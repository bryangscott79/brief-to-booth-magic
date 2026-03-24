-- Create activation_types table
CREATE TABLE public.activation_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT NOT NULL DEFAULT 'experience',
  parent_type_affinity TEXT[] NOT NULL DEFAULT '{}',
  default_scale TEXT,
  default_sqft INTEGER,
  element_emphasis JSONB,
  render_context_override TEXT,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.activation_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Builtins readable by authenticated"
  ON public.activation_types FOR SELECT
  USING (is_builtin = true OR auth.uid() = user_id);

CREATE POLICY "Users can create custom activation types"
  ON public.activation_types FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_builtin = false);

CREATE POLICY "Users can update their own activation types"
  ON public.activation_types FOR UPDATE
  USING (auth.uid() = user_id AND is_builtin = false);

CREATE POLICY "Users can delete their own activation types"
  ON public.activation_types FOR DELETE
  USING (auth.uid() = user_id AND is_builtin = false);

CREATE OR REPLACE FUNCTION public.update_activation_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_activation_types_updated_at
  BEFORE UPDATE ON public.activation_types
  FOR EACH ROW EXECUTE FUNCTION public.update_activation_types_updated_at();

INSERT INTO public.activation_types (slug, label, description, icon, category, parent_type_affinity, default_scale, default_sqft, is_builtin) VALUES
  ('main_booth', 'Main Booth', 'Primary exhibition or trade show booth', '🏢', 'anchor', '{}', 'island', 400, true),
  ('vip_lounge', 'VIP Lounge', 'Private lounge area for VIP guests and key clients', '☕', 'hospitality', '{}', 'inline', 200, true),
  ('demo_station', 'Demo Station', 'Product or technology demonstration area', '🖥️', 'product', '{}', 'tabletop', 100, true),
  ('meeting_room', 'Meeting Room', 'Private or semi-private meeting space', '💬', 'hospitality', '{}', 'inline', 150, true),
  ('outdoor_activation', 'Outdoor Activation', 'Exterior activation or sampling area', '⛺', 'experience', '{}', 'inline', 200, true),
  ('digital_experience', 'Digital Experience', 'Interactive screen or digital engagement zone', '✨', 'digital', '{}', 'tabletop', 80, true),
  ('product_showcase', 'Product Showcase', 'Dedicated display area for featured products', '🎯', 'product', '{}', 'inline', 120, true),
  ('bar_station', 'Bar / Sampling Station', 'Beverage or product sampling bar', '🍸', 'hospitality', '{}', 'tabletop', 60, true),
  ('stage_area', 'Stage / Presentation Area', 'Presentation stage or speaking area', '🎤', 'experience', '{}', 'peninsula', 300, true),
  ('photo_moment', 'Photo Moment / Content Zone', 'Branded photo opportunity or social content capture area', '📸', 'experience', '{}', 'tabletop', 80, true),
  ('gaming_zone', 'Gaming / Challenge Zone', 'Interactive game or competition area', '🎮', 'experience', '{}', 'inline', 150, true),
  ('storage_workroom', 'Storage / Work Room', 'Back-of-house storage and staff workspace', '📦', 'operations', '{}', 'inline', 100, true);