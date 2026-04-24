-- =========================================================
-- 1) Per-agency override table for built-in activation types
-- =========================================================
CREATE TABLE IF NOT EXISTS public.activation_type_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  activation_type_id UUID NOT NULL REFERENCES public.activation_types(id) ON DELETE CASCADE,
  description TEXT,
  template JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, activation_type_id)
);

CREATE INDEX IF NOT EXISTS idx_atov_agency ON public.activation_type_overrides(agency_id);
CREATE INDEX IF NOT EXISTS idx_atov_type   ON public.activation_type_overrides(activation_type_id);

ALTER TABLE public.activation_type_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view their overrides" ON public.activation_type_overrides;
CREATE POLICY "Members view their overrides"
  ON public.activation_type_overrides
  FOR SELECT
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "Members insert their overrides" ON public.activation_type_overrides;
CREATE POLICY "Members insert their overrides"
  ON public.activation_type_overrides
  FOR INSERT
  WITH CHECK (public.is_agency_member(agency_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Members update their overrides" ON public.activation_type_overrides;
CREATE POLICY "Members update their overrides"
  ON public.activation_type_overrides
  FOR UPDATE
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "Members delete their overrides" ON public.activation_type_overrides;
CREATE POLICY "Members delete their overrides"
  ON public.activation_type_overrides
  FOR DELETE
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

DROP TRIGGER IF EXISTS trg_atov_updated_at ON public.activation_type_overrides;
CREATE TRIGGER trg_atov_updated_at
  BEFORE UPDATE ON public.activation_type_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2) Seed defaults onto each built-in activation type
-- =========================================================
-- We write into element_emphasis JSONB at key 'template' so existing UI works.
-- Also fill description if empty.

-- Main Booth
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Primary exhibition or trade show booth — the brand''s flagship presence on the show floor. Anchors hero messaging, product showcase, and visitor flow.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Prominent brand logo & wordmark', 'Hero product or visual moment', 'Clear entry point with welcoming flow', 'Demo or engagement zone', 'Lead capture / staff station', 'Branded floor graphics or carpet'),
      'must_avoid', jsonb_build_array('Cluttered backwall with mixed messages', 'Hidden or hard-to-see signage', 'Dead-end traffic patterns', 'Fully closed walls that block sightlines'),
      'sqft_min', 100,
      'sqft_max', 2000,
      'notes', 'This is the brand''s primary footprint. Maintain strong sightlines from main aisle, prioritize hero product visibility, and ensure the brand identity reads from 30+ feet away.'
    )
  )
WHERE slug = 'main_booth';

-- Demo Station
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Product or technology demonstration area where staff actively show features and answer questions. Hands-on, interactive, attention-magnet.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Demo unit on counter or pedestal', 'Screen or display for amplified visuals', 'Standing-height counter or table', 'Power and connectivity', 'Branded backdrop or signage', 'Space for 1-2 staff and 3-5 guests'),
      'must_avoid', jsonb_build_array('Seated couches or lounge furniture', 'Dim or moody lighting', 'Quiet/contemplative atmosphere', 'Solo browsing without staff'),
      'sqft_min', 60,
      'sqft_max', 250,
      'notes', 'Designed for active demonstration. Keep height standing-friendly, lighting bright, and ensure the demo product is the visual anchor.'
    )
  )
WHERE slug = 'demo_station';

-- VIP Lounge
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Private lounge area for VIP guests, key clients, and high-touch conversations. Quieter, more residential, premium materials.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Comfortable seating (sofas, lounge chairs)', 'Coffee/side tables', 'Soft, layered lighting', 'Hospitality element (coffee bar, water, snacks)', 'Acoustic separation from main floor', 'Premium materials (wood, stone, leather)'),
      'must_avoid', jsonb_build_array('Loud demo equipment', 'Bright fluorescent lighting', 'Open sightlines from main aisle', 'Standing-only configurations'),
      'sqft_min', 150,
      'sqft_max', 800,
      'notes', 'Premium, quiet, residential feel. Should signal exclusivity through materials and lighting. Avoid trade-show clichés.'
    )
  )
WHERE slug = 'vip_lounge';

-- Photo Moment / Content Zone
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Branded photo opportunity or social content capture area designed to be shared. Driven by a single hero visual or set piece.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Single visually striking hero element', 'Branded backdrop or set piece', 'Even, photo-friendly lighting', 'Floor markings for ideal photo position', 'Clear sightline for camera/phone', 'Hashtag or campaign signage'),
      'must_avoid', jsonb_build_array('Busy competing backgrounds', 'Mixed lighting temperatures', 'Reflective surfaces causing flare', 'Tight spaces that prevent group photos'),
      'sqft_min', 80,
      'sqft_max', 400,
      'notes', 'Optimized for social shareability. The hero visual should be unmistakable and own-able. Lighting must flatter skin tones.'
    )
  )
WHERE slug = 'photo_moment';

-- Stage / Presentation Area
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Presentation stage or speaking area for keynotes, panels, and scheduled programming. Audience-facing, theatrical, content-driven.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Raised stage or clearly defined platform', 'LED wall or large display backdrop', 'Audience seating or standing area', 'Stage lighting (wash + key)', 'PA / audio system', 'Lectern or presenter mark'),
      'must_avoid', jsonb_build_array('Audience facing into bright aisle lights', 'Cramped backstage with no presenter prep', 'Sightlines blocked by structural elements', 'Sound bleed into adjacent quiet zones'),
      'sqft_min', 300,
      'sqft_max', 2500,
      'notes', 'Treat like a black-box theater. Sightlines, acoustics, and lighting are paramount. Audience capacity drives footprint.'
    )
  )
WHERE slug = 'stage_area';

-- Meeting Room
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Private or semi-private meeting space for scheduled client conversations and deal-making. Acoustic privacy, focused lighting, hospitality.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Conference table or roundtable', 'Seating for 4-8 people', 'Door or visual privacy partition', 'Display screen for presentations', 'Power and connectivity at table', 'Subtle branding (not loud signage)'),
      'must_avoid', jsonb_build_array('Open walls visible from aisle', 'Loud audio bleed from neighbors', 'Public-facing demo elements', 'Bright theatrical lighting'),
      'sqft_min', 80,
      'sqft_max', 300,
      'notes', 'Functions like a corporate conference room. Privacy and acoustics matter more than visual showmanship.'
    )
  )
WHERE slug = 'meeting_room';

-- Bar / Sampling Station
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Beverage or product sampling bar where guests gather for tastings and brief brand interaction. Social, energetic, hospitality-focused.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Bar counter at standing height', 'Bartender / staff position', 'Backbar display with product hero', 'Glassware / sampling cups', 'Refrigeration or storage', 'Signage with menu or product story'),
      'must_avoid', jsonb_build_array('Seated dining setup', 'Hidden or back-of-booth placement', 'Slow-moving solo demos at bar', 'Inadequate trash/recycling for cups'),
      'sqft_min', 80,
      'sqft_max', 400,
      'notes', 'Designed for high throughput and social energy. Bar should be visible from the aisle and pull people in with an iconic backbar.'
    )
  )
WHERE slug = 'bar_station';

-- Product Showcase
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Dedicated display area for featured products. Museum-grade presentation with focused lighting, plinths, and storytelling.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Plinths, pedestals, or display vitrines', 'Focused product spotlighting', 'Product description signage', 'Clear walking path around displays', 'Visual hierarchy (hero product foregrounded)', 'Anti-tamper mounting if accessible'),
      'must_avoid', jsonb_build_array('Crowded shelves with no breathing room', 'Flat overhead lighting that kills product detail', 'Touch / interaction without staff supervision', 'Mixed product categories competing for attention'),
      'sqft_min', 100,
      'sqft_max', 800,
      'notes', 'Treat each product like a museum artifact. Lighting and negative space matter as much as the product itself.'
    )
  )
WHERE slug = 'product_showcase';

-- Gaming / Challenge Zone
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Interactive game or competition area driving repeat engagement, dwell time, and lead capture through play.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Game station or competition setup', 'Leaderboard / score display', 'Queue management space', 'Prize / reward area', 'Energetic lighting and sound', 'Staff position to manage flow'),
      'must_avoid', jsonb_build_array('Quiet contemplative atmosphere', 'Single-player only with long playtime', 'No clear win condition or reward', 'Sound bleed disrupting nearby meetings'),
      'sqft_min', 150,
      'sqft_max', 600,
      'notes', 'Energy and visible competition drive engagement. Keep playtime under 3 minutes per turn to manage queues.'
    )
  )
WHERE slug = 'gaming_zone';

-- Digital Experience
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Interactive screen or digital engagement zone — touchscreens, AR, projection, or immersive media driven by user interaction.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Large touchscreen, projection, or LED canvas', 'Clear interaction prompts and onboarding', 'Controlled ambient lighting (dimmer for screens)', 'Power, network, and content delivery system', 'Failover content for downtime', 'Staff position to assist first-time users'),
      'must_avoid', jsonb_build_array('Direct sunlight or harsh overhead lights washing screens', 'No instructions / unclear how to start', 'Single-user experience with high queue demand', 'Content with no clear conclusion or hand-off'),
      'sqft_min', 100,
      'sqft_max', 600,
      'notes', 'Lighting must be controlled to favor screen visibility. Always design for graceful failure when tech goes down.'
    )
  )
WHERE slug = 'digital_experience';

-- Outdoor Activation
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Exterior activation, sampling, or pop-up area on streets, plazas, or festival grounds. Weather-aware, mobile, public-facing.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Weather-resistant materials and structures', 'Tent, canopy, or shade element', 'Visible branding from 100+ feet', 'Power source (generator or grid tap)', 'Trash and recycling provisions', 'Permits and accessibility compliance'),
      'must_avoid', jsonb_build_array('Materials that fade in sun or warp in rain', 'Indoor-only flooring or finishes', 'Power-hungry tech without backup', 'Setups blocking emergency access lanes'),
      'sqft_min', 100,
      'sqft_max', 4000,
      'notes', 'Always plan for wind, rain, and sun. Anchor everything. Branding must read at distance and at speed (foot or vehicle traffic).'
    )
  )
WHERE slug = 'outdoor_activation';

-- Storage / Work Room
UPDATE public.activation_types SET
  description = COALESCE(NULLIF(description,''), 'Back-of-house storage and staff workspace. Functional, hidden from guest view, supports the front-of-house operation.'),
  element_emphasis = jsonb_set(
    COALESCE(element_emphasis, '{}'::jsonb),
    '{template}',
    jsonb_build_object(
      'must_have', jsonb_build_array('Lockable door or visual privacy', 'Shelving or storage units', 'Counter or work surface', 'Trash and recycling', 'Coat / bag storage for staff', 'Power outlets'),
      'must_avoid', jsonb_build_array('Visible from main guest area', 'Glass or open walls', 'Branded finishes (waste of budget)', 'Thru-traffic or shared with guest flow'),
      'sqft_min', 50,
      'sqft_max', 200,
      'notes', 'Pure utility. Hide it. Spend zero on aesthetics — every dollar saved here can fund the front-of-house experience.'
    )
  )
WHERE slug = 'storage_workroom';
