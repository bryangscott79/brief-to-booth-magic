-- =========================================================================
-- PRICING ENGINE — Phase 1A
--
-- Foundational data model for plan-tied real-time pricing. Lays the
-- substrate for:
--   - Architecture & construction estimating (Xactimate-class workflows)
--   - A/V install configuration + costing
--   - Experiential booth costing
--   - Any vertical where a plan decomposes to items × prices.
--
-- v1 in this migration:
--   1. New industry: audio_visual (with project types)
--   2. plan_items: bill of materials per project (csi_division/uniformat)
--   3. pricing_sources: where prices come from (rate_card / ai / commodity / vendor / manual)
--   4. pricing_quotes: actual unit prices, dated, regional, quality-tiered
--   5. regional_factors: cost-index multipliers by region
--   6. price_plan(project_id, region?, quality_tier?) RPC: priced BOM
--
-- Deferred to Phase 1B: rate-card CSV import, AI estimation function,
-- commodity feed ingestion, snapshots/versioning, inventory.
-- =========================================================================

-- 1. New industry: A/V install ----------------------------------------------
INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order) VALUES
  (
    'audio_visual',
    'A/V Integration & Install',
    'Audio-visual systems for corporate, hospitality, education, worship, residential.',
    'Speaker',
    jsonb_build_object(
      'project_type',  'System type',
      'project_types', 'System types',
      'project',       'Install',
      'projects',      'Installs',
      'deliverable',   'Equipment list & layout',
      'render',        'System rendering',
      'spatial_plan',  'Equipment layout',
      'brief',         'Scope of work',
      'client',        'Client'
    ),
    50
  )
ON CONFLICT (slug) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  vocabulary  = EXCLUDED.vocabulary,
  sort_order  = EXCLUDED.sort_order,
  updated_at  = now();

-- A/V project types (built-in) -----------------------------------------------
INSERT INTO public.activation_types (slug, label, description, category, industries, is_builtin) VALUES
  ('av_conference_room',   'Conference room AV',     'Huddle through executive boardroom — displays, cameras, mics, control.',  'commercial',  ARRAY['audio_visual'], true),
  ('av_boardroom',         'Executive boardroom',    'Premium boardroom with multi-display + UC + acoustics.',                   'commercial',  ARRAY['audio_visual'], true),
  ('av_classroom',         'Classroom / training',   'Education / training rooms — displays, lecture capture, mics.',            'civic',       ARRAY['audio_visual'], true),
  ('av_lecture_hall',      'Lecture hall / auditorium', 'Large lecture halls + auditoriums.',                                    'civic',       ARRAY['audio_visual'], true),
  ('av_house_of_worship',  'House of worship',       'Church / synagogue / mosque AV — sound, video, streaming.',                'civic',       ARRAY['audio_visual'], true),
  ('av_restaurant',        'Restaurant / hospitality', 'Restaurants, bars, hotels — distributed audio + video.',                 'hospitality', ARRAY['audio_visual'], true),
  ('av_retail',            'Retail signage / digital', 'Digital signage, queue-management, in-store experience.',                'commercial',  ARRAY['audio_visual'], true),
  ('av_home_theater',      'Home theater',           'Residential dedicated home theater + media room.',                         'residential', ARRAY['audio_visual'], true),
  ('av_smart_home',        'Smart home / whole-home audio', 'Whole-home automation, audio distribution, lighting integration.',  'residential', ARRAY['audio_visual'], true),
  ('av_command_control',   'Command & control',      'Operations centers, security ops, broadcast control rooms.',               'commercial',  ARRAY['audio_visual'], true),
  ('av_stadium_arena',     'Stadium / arena',        'Venue-scale AV — scoreboards, distributed audio, broadcast.',              'live',        ARRAY['audio_visual'], true),
  ('av_corporate_lobby',   'Corporate lobby / video wall', 'Lobby video walls, branded signage, donor displays.',                'commercial',  ARRAY['audio_visual'], true)
ON CONFLICT (slug) DO UPDATE SET
  industries = EXCLUDED.industries,
  category   = EXCLUDED.category,
  description = COALESCE(public.activation_types.description, EXCLUDED.description),
  is_builtin = EXCLUDED.is_builtin;

-- 2. plan_items — bill of materials per project -----------------------------
CREATE TABLE IF NOT EXISTS public.plan_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agency_id       uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Industry-standard categorization. Either CSI division or Uniformat class
  -- can be set; both null is fine for vertical-specific items (e.g. AV gear).
  csi_division     text,             -- '03 - Concrete', '06 - Wood', '23 - HVAC', etc.
  uniformat_class  text,             -- 'B2010 - Exterior Walls', 'C3010 - Interior Doors', etc.

  -- Generic categorization that works across industries
  category        text,              -- 'structural'|'finish'|'mechanical'|'av_equipment'|'fixture'|'labor'|...
  -- Stable slug used to match against pricing_quotes.item_key
  item_key        text NOT NULL,     -- e.g. '2x4_lumber_8ft_pt', 'speaker_ceiling_70v_8w', 'paint_sw_emerald_eggshell_gallon'
  description     text NOT NULL,     -- Human-readable line description
  manufacturer    text,
  model_number    text,

  -- Quantity + unit
  quantity        numeric(14, 3) NOT NULL DEFAULT 1,
  unit            text NOT NULL DEFAULT 'each',  -- 'each'|'sqft'|'lf'|'cy'|'hr'|'gallon'|...

  quality_tier    text NOT NULL DEFAULT 'standard'
    CHECK (quality_tier IN ('basic','standard','premium','custom')),

  -- Optional 3D position when placed on a spatial plan (x,y in plan units, z = height)
  position        jsonb,

  -- Override pricing — if set, the engine uses these instead of looked-up prices
  override_unit_price numeric(14, 2),
  override_currency   text DEFAULT 'USD',
  override_reason     text,

  -- Free-form fields
  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Optional: what plan revision this belongs to (deferred — single revision for v1)
  -- plan_revision  int,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS plan_items_project_idx   ON public.plan_items(project_id);
CREATE INDEX IF NOT EXISTS plan_items_agency_idx    ON public.plan_items(agency_id);
CREATE INDEX IF NOT EXISTS plan_items_item_key_idx  ON public.plan_items(item_key);
CREATE INDEX IF NOT EXISTS plan_items_csi_idx       ON public.plan_items(csi_division);

ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_members_can_write_plan_items"
  ON public.plan_items FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

-- 3. pricing_sources — where prices come from -------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- agency_id NULL = global / shared source (commodity feeds, public datasets)
  agency_id       uuid REFERENCES public.agencies(id) ON DELETE CASCADE,

  source_type     text NOT NULL CHECK (source_type IN (
    'agency_rate_card',
    'agency_inventory',
    'ai_estimate',
    'commodity_feed',
    'vendor_api',
    'rsmeans',
    'subcontractor_quote',
    'manual'
  )),
  vendor_name     text,
  region          text,           -- 'global' | ZIP | metro | state | country
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  -- For source-specific config (API keys ref, scrape URL, etc.)
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_refreshed_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_sources_agency_idx ON public.pricing_sources(agency_id);
CREATE INDEX IF NOT EXISTS pricing_sources_type_idx   ON public.pricing_sources(source_type);

ALTER TABLE public.pricing_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read pricing_sources"
  ON public.pricing_sources FOR SELECT
  USING (
    agency_id IS NULL
    OR public.is_super_admin(auth.uid())
    OR public.is_agency_member(auth.uid(), agency_id)
  );

CREATE POLICY "Agency admins write pricing_sources"
  ON public.pricing_sources FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      agency_id IS NOT NULL
      AND public.is_agency_admin(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      agency_id IS NOT NULL
      AND public.is_agency_admin(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

-- 4. pricing_quotes — actual unit prices ------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES public.pricing_sources(id) ON DELETE CASCADE,
  agency_id       uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
    -- denormalized for RLS speed; nullable for global feeds (matches source.agency_id)

  -- Matching keys: an item is found by (item_key, region, quality_tier).
  item_key        text NOT NULL,
  region          text,            -- 'global' | ZIP | metro | state
  quality_tier    text NOT NULL DEFAULT 'standard'
    CHECK (quality_tier IN ('basic','standard','premium','custom')),

  -- Optional human-readable label (in case multiple quotes match same key)
  label           text,
  manufacturer    text,
  model_number    text,

  unit            text NOT NULL,
  unit_price      numeric(14, 4) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',

  -- Provenance
  source_url      text,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  valid_until     timestamptz,
  confidence      text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high','medium','low')),

  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pricing_quotes_lookup_idx
  ON public.pricing_quotes(item_key, region, quality_tier, fetched_at DESC);
CREATE INDEX IF NOT EXISTS pricing_quotes_source_idx ON public.pricing_quotes(source_id);
CREATE INDEX IF NOT EXISTS pricing_quotes_agency_idx ON public.pricing_quotes(agency_id);

ALTER TABLE public.pricing_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members read pricing_quotes"
  ON public.pricing_quotes FOR SELECT
  USING (
    agency_id IS NULL
    OR public.is_super_admin(auth.uid())
    OR public.is_agency_member(auth.uid(), agency_id)
  );

CREATE POLICY "Agency admins write pricing_quotes"
  ON public.pricing_quotes FOR ALL
  USING (
    public.is_super_admin(auth.uid())
    OR (
      agency_id IS NOT NULL
      AND public.is_agency_admin(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      agency_id IS NOT NULL
      AND public.is_agency_admin(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

-- 5. regional_factors — cost adjustment by region ---------------------------
CREATE TABLE IF NOT EXISTS public.regional_factors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region          text NOT NULL,           -- ZIP | metro | state | country
  region_kind     text NOT NULL DEFAULT 'metro' CHECK (region_kind IN ('zip','metro','state','country')),
  category        text,                    -- null = applies to all categories; otherwise scoped
  factor          numeric(6, 4) NOT NULL DEFAULT 1.0,
  source          text,                    -- 'rsmeans'|'eng_news_record'|'manual'
  notes           text,
  effective_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region, region_kind, category, effective_at)
);

CREATE INDEX IF NOT EXISTS regional_factors_lookup_idx
  ON public.regional_factors(region, region_kind, category, effective_at DESC);

ALTER TABLE public.regional_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read regional_factors"
  ON public.regional_factors FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins write regional_factors"
  ON public.regional_factors FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Seed a baseline factor of 1.0 for the US national average
INSERT INTO public.regional_factors (region, region_kind, category, factor, source, notes)
VALUES ('US', 'country', NULL, 1.0, 'baseline', 'National baseline = 1.0')
ON CONFLICT DO NOTHING;

-- 6. updated_at triggers ----------------------------------------------------
DROP TRIGGER IF EXISTS plan_items_updated_at ON public.plan_items;
CREATE TRIGGER plan_items_updated_at BEFORE UPDATE ON public.plan_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS pricing_sources_updated_at ON public.pricing_sources;
CREATE TRIGGER pricing_sources_updated_at BEFORE UPDATE ON public.pricing_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. price_plan RPC ---------------------------------------------------------
-- Returns each plan_item with its best-available current price, computed
-- total_price, source, and freshness signals.
--
-- Resolution order per item:
--   1. override_unit_price on plan_items (always wins)
--   2. agency-owned pricing_quotes matching (item_key, region, quality_tier),
--      most recent first
--   3. global pricing_quotes (agency_id IS NULL) matching same keys
--   4. unpriced (returns null unit_price + 'no_quote' source)
--
-- regional_factor is applied multiplicatively when the matched quote's
-- region differs from _region.
CREATE OR REPLACE FUNCTION public.price_plan(
  _project_id    uuid,
  _region        text DEFAULT NULL,
  _quality_tier  text DEFAULT NULL
)
RETURNS TABLE (
  item_id          uuid,
  item_key         text,
  description      text,
  manufacturer     text,
  csi_division     text,
  category         text,
  quality_tier     text,
  quantity         numeric,
  unit             text,
  unit_price       numeric,
  total_price      numeric,
  currency         text,
  source           text,           -- 'override' | 'agency_rate_card' | 'ai_estimate' | … | 'no_quote'
  source_id        uuid,
  source_label     text,
  region_used      text,
  regional_factor  numeric,
  fetched_at       timestamptz,
  confidence       text,
  is_priced        boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_agency uuid;
BEGIN
  -- Determine the caller's agency by looking up the project. We trust RLS
  -- on plan_items to gate access; this function is just a join helper.
  SELECT p.agency_id INTO caller_agency FROM public.projects p WHERE p.id = _project_id;
  IF caller_agency IS NULL THEN
    RAISE EXCEPTION 'Project % not found or has no agency', _project_id USING ERRCODE = '42704';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      pi.id, pi.item_key, pi.description, pi.manufacturer, pi.csi_division,
      pi.category,
      COALESCE(_quality_tier, pi.quality_tier) AS quality_tier,
      pi.quantity, pi.unit,
      pi.override_unit_price, pi.override_currency,
      pi.agency_id
    FROM public.plan_items pi
    WHERE pi.project_id = _project_id
  ),
  -- Best agency-scoped quote for each item (most recent fetched_at)
  agency_quote AS (
    SELECT DISTINCT ON (b.id)
      b.id AS item_id,
      pq.id AS quote_id, pq.unit_price, pq.currency, pq.region, pq.fetched_at,
      pq.confidence, pq.source_id,
      ps.source_type, ps.vendor_name
    FROM base b
    JOIN public.pricing_quotes pq
      ON pq.item_key = b.item_key
     AND pq.quality_tier = b.quality_tier
     AND pq.agency_id = b.agency_id
     AND (
       _region IS NULL
       OR pq.region IS NULL
       OR pq.region = _region
       OR pq.region = 'global'
     )
    JOIN public.pricing_sources ps ON ps.id = pq.source_id AND ps.is_active
    ORDER BY b.id, pq.fetched_at DESC
  ),
  -- Best global quote (only when no agency quote exists)
  global_quote AS (
    SELECT DISTINCT ON (b.id)
      b.id AS item_id,
      pq.id AS quote_id, pq.unit_price, pq.currency, pq.region, pq.fetched_at,
      pq.confidence, pq.source_id,
      ps.source_type, ps.vendor_name
    FROM base b
    JOIN public.pricing_quotes pq
      ON pq.item_key = b.item_key
     AND pq.quality_tier = b.quality_tier
     AND pq.agency_id IS NULL
     AND (
       _region IS NULL
       OR pq.region IS NULL
       OR pq.region = _region
       OR pq.region = 'global'
     )
    JOIN public.pricing_sources ps ON ps.id = pq.source_id AND ps.is_active
    WHERE NOT EXISTS (SELECT 1 FROM agency_quote aq WHERE aq.item_id = b.id)
    ORDER BY b.id, pq.fetched_at DESC
  ),
  -- Regional factor (most-specific match wins). Only applied when the
  -- selected quote's region differs from _region.
  rf AS (
    SELECT category, factor FROM public.regional_factors
    WHERE region = _region AND region_kind IN ('zip','metro','state','country')
      AND effective_at <= now()
    ORDER BY effective_at DESC
  )
  SELECT
    b.id AS item_id,
    b.item_key,
    b.description,
    b.manufacturer,
    b.csi_division,
    b.category,
    b.quality_tier,
    b.quantity,
    b.unit,

    -- Unit price (override > agency > global > null)
    COALESCE(
      b.override_unit_price,
      aq.unit_price,
      gq.unit_price
    ) AS unit_price,

    -- Total: quantity × unit_price × regional_factor
    CASE
      WHEN b.override_unit_price IS NOT NULL THEN
        b.quantity * b.override_unit_price
      WHEN aq.unit_price IS NOT NULL THEN
        b.quantity * aq.unit_price * COALESCE(
          (SELECT factor FROM rf WHERE category = b.category LIMIT 1),
          (SELECT factor FROM rf WHERE category IS NULL  LIMIT 1),
          1.0
        )
      WHEN gq.unit_price IS NOT NULL THEN
        b.quantity * gq.unit_price * COALESCE(
          (SELECT factor FROM rf WHERE category = b.category LIMIT 1),
          (SELECT factor FROM rf WHERE category IS NULL  LIMIT 1),
          1.0
        )
      ELSE NULL
    END AS total_price,

    COALESCE(b.override_currency, aq.currency, gq.currency, 'USD') AS currency,

    -- Source label
    CASE
      WHEN b.override_unit_price IS NOT NULL THEN 'override'
      WHEN aq.source_type IS NOT NULL THEN aq.source_type
      WHEN gq.source_type IS NOT NULL THEN gq.source_type
      ELSE 'no_quote'
    END AS source,

    COALESCE(aq.source_id, gq.source_id) AS source_id,
    COALESCE(aq.vendor_name, gq.vendor_name) AS source_label,
    COALESCE(aq.region, gq.region) AS region_used,
    COALESCE(
      (SELECT factor FROM rf WHERE category = b.category LIMIT 1),
      (SELECT factor FROM rf WHERE category IS NULL  LIMIT 1),
      1.0
    )::numeric AS regional_factor,

    COALESCE(aq.fetched_at, gq.fetched_at) AS fetched_at,
    COALESCE(aq.confidence, gq.confidence,
      CASE WHEN b.override_unit_price IS NOT NULL THEN 'high' ELSE NULL END
    ) AS confidence,

    (b.override_unit_price IS NOT NULL OR aq.unit_price IS NOT NULL OR gq.unit_price IS NOT NULL) AS is_priced
  FROM base b
  LEFT JOIN agency_quote aq ON aq.item_id = b.id
  LEFT JOIN global_quote gq ON gq.item_id = b.id
  ORDER BY b.csi_division NULLS LAST, b.category NULLS LAST, b.description;
END;
$$;

GRANT EXECUTE ON FUNCTION public.price_plan(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.price_plan(uuid, text, text) IS
  'Returns priced BOM for a project. Resolution: override > agency rate ' ||
  'card > global feed > unpriced. Applies regional_factor to non-override prices.';

-- 8. Helper: project_pricing_summary ----------------------------------------
-- Aggregate roll-up by csi_division for header tiles.
CREATE OR REPLACE FUNCTION public.project_pricing_summary(
  _project_id   uuid,
  _region       text DEFAULT NULL,
  _quality_tier text DEFAULT NULL
)
RETURNS TABLE (
  csi_division   text,
  category       text,
  item_count     int,
  priced_count   int,
  subtotal       numeric,
  unpriced_count int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    csi_division,
    category,
    COUNT(*)::int AS item_count,
    COUNT(*) FILTER (WHERE is_priced)::int AS priced_count,
    COALESCE(SUM(total_price), 0)::numeric AS subtotal,
    COUNT(*) FILTER (WHERE NOT is_priced)::int AS unpriced_count
  FROM public.price_plan(_project_id, _region, _quality_tier)
  GROUP BY ROLLUP (csi_division, category)
  ORDER BY csi_division NULLS LAST, category NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.project_pricing_summary(uuid, text, text) TO authenticated;
