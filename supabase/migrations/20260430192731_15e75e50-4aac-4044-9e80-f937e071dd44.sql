-- =========================================================================
-- CONSOLIDATED + FIXED MIGRATION
-- Applies (idempotently):
--   - 20260427210000_pricing_engine_phase1a.sql
--   - 20260427230000_industry_admin_and_kb.sql
--   - 20260427233000_lock_industry_isolation.sql
--   - 20260428000000_reseed_industries_and_project_types.sql
--
-- Fixes vs. the originals:
--   * is_agency_member / is_agency_admin called with (agency_id) — original
--     order was (uid, agency_id) which doesn't match the deployed signature
--     (agency_id, uid DEFAULT auth.uid()).
--   * Removed references to non-existent agency_has_access() (replaced by
--     simple member/admin checks; access-gating is handled elsewhere).
--   * Added the helper _require_super_admin() that the original migrations
--     called but never defined.
-- =========================================================================

-- 0. Helper used by all admin RPCs ------------------------------------------
CREATE OR REPLACE FUNCTION public._require_super_admin()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Super admin role required' USING ERRCODE = '42501';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public._require_super_admin() TO authenticated;


-- =========================================================================
-- 1) PRICING ENGINE — Phase 1A
-- =========================================================================

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

-- plan_items
CREATE TABLE IF NOT EXISTS public.plan_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  agency_id       uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  csi_division     text,
  uniformat_class  text,
  category        text,
  item_key        text NOT NULL,
  description     text NOT NULL,
  manufacturer    text,
  model_number    text,
  quantity        numeric(14, 3) NOT NULL DEFAULT 1,
  unit            text NOT NULL DEFAULT 'each',
  quality_tier    text NOT NULL DEFAULT 'standard'
    CHECK (quality_tier IN ('basic','standard','premium','custom')),
  position        jsonb,
  override_unit_price numeric(14, 2),
  override_currency   text DEFAULT 'USD',
  override_reason     text,
  notes           text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS plan_items_project_idx   ON public.plan_items(project_id);
CREATE INDEX IF NOT EXISTS plan_items_agency_idx    ON public.plan_items(agency_id);
CREATE INDEX IF NOT EXISTS plan_items_item_key_idx  ON public.plan_items(item_key);
CREATE INDEX IF NOT EXISTS plan_items_csi_idx       ON public.plan_items(csi_division);
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agency_members_can_write_plan_items" ON public.plan_items;
CREATE POLICY "agency_members_can_write_plan_items"
  ON public.plan_items FOR ALL
  USING (public.is_super_admin() OR public.is_agency_member(agency_id))
  WITH CHECK (public.is_super_admin() OR public.is_agency_member(agency_id));

-- pricing_sources
CREATE TABLE IF NOT EXISTS public.pricing_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  source_type     text NOT NULL CHECK (source_type IN (
    'agency_rate_card','agency_inventory','ai_estimate','commodity_feed',
    'vendor_api','rsmeans','subcontractor_quote','manual'
  )),
  vendor_name     text,
  region          text,
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_refreshed_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pricing_sources_agency_idx ON public.pricing_sources(agency_id);
CREATE INDEX IF NOT EXISTS pricing_sources_type_idx   ON public.pricing_sources(source_type);
ALTER TABLE public.pricing_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agency members read pricing_sources" ON public.pricing_sources;
CREATE POLICY "Agency members read pricing_sources"
  ON public.pricing_sources FOR SELECT
  USING (
    agency_id IS NULL
    OR public.is_super_admin()
    OR public.is_agency_member(agency_id)
  );
DROP POLICY IF EXISTS "Agency admins write pricing_sources" ON public.pricing_sources;
CREATE POLICY "Agency admins write pricing_sources"
  ON public.pricing_sources FOR ALL
  USING (
    public.is_super_admin()
    OR (agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
  );

-- pricing_quotes
CREATE TABLE IF NOT EXISTS public.pricing_quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid NOT NULL REFERENCES public.pricing_sources(id) ON DELETE CASCADE,
  agency_id       uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  item_key        text NOT NULL,
  region          text,
  quality_tier    text NOT NULL DEFAULT 'standard'
    CHECK (quality_tier IN ('basic','standard','premium','custom')),
  label           text,
  manufacturer    text,
  model_number    text,
  unit            text NOT NULL,
  unit_price      numeric(14, 4) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
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
DROP POLICY IF EXISTS "Agency members read pricing_quotes" ON public.pricing_quotes;
CREATE POLICY "Agency members read pricing_quotes"
  ON public.pricing_quotes FOR SELECT
  USING (
    agency_id IS NULL
    OR public.is_super_admin()
    OR public.is_agency_member(agency_id)
  );
DROP POLICY IF EXISTS "Agency admins write pricing_quotes" ON public.pricing_quotes;
CREATE POLICY "Agency admins write pricing_quotes"
  ON public.pricing_quotes FOR ALL
  USING (
    public.is_super_admin()
    OR (agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
  )
  WITH CHECK (
    public.is_super_admin()
    OR (agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
  );

-- regional_factors
CREATE TABLE IF NOT EXISTS public.regional_factors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region          text NOT NULL,
  region_kind     text NOT NULL DEFAULT 'metro' CHECK (region_kind IN ('zip','metro','state','country')),
  category        text,
  factor          numeric(6, 4) NOT NULL DEFAULT 1.0,
  source          text,
  notes           text,
  effective_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region, region_kind, category, effective_at)
);
CREATE INDEX IF NOT EXISTS regional_factors_lookup_idx
  ON public.regional_factors(region, region_kind, category, effective_at DESC);
ALTER TABLE public.regional_factors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read regional_factors" ON public.regional_factors;
CREATE POLICY "Authenticated read regional_factors"
  ON public.regional_factors FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Super admins write regional_factors" ON public.regional_factors;
CREATE POLICY "Super admins write regional_factors"
  ON public.regional_factors FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.regional_factors (region, region_kind, category, factor, source, notes)
VALUES ('US', 'country', NULL, 1.0, 'baseline', 'National baseline = 1.0')
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS plan_items_updated_at ON public.plan_items;
CREATE TRIGGER plan_items_updated_at BEFORE UPDATE ON public.plan_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS pricing_sources_updated_at ON public.pricing_sources;
CREATE TRIGGER pricing_sources_updated_at BEFORE UPDATE ON public.pricing_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- price_plan RPC
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
  source           text,
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
  SELECT am.agency_id INTO caller_agency
  FROM public.projects p
  LEFT JOIN public.agency_members am ON am.user_id = p.user_id
  WHERE p.id = _project_id
  LIMIT 1;
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
       _region IS NULL OR pq.region IS NULL OR pq.region = _region OR pq.region = 'global'
     )
    JOIN public.pricing_sources ps ON ps.id = pq.source_id AND ps.is_active
    ORDER BY b.id, pq.fetched_at DESC
  ),
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
       _region IS NULL OR pq.region IS NULL OR pq.region = _region OR pq.region = 'global'
     )
    JOIN public.pricing_sources ps ON ps.id = pq.source_id AND ps.is_active
    WHERE NOT EXISTS (SELECT 1 FROM agency_quote aq WHERE aq.item_id = b.id)
    ORDER BY b.id, pq.fetched_at DESC
  ),
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
    COALESCE(b.override_unit_price, aq.unit_price, gq.unit_price) AS unit_price,
    CASE
      WHEN b.override_unit_price IS NOT NULL THEN b.quantity * b.override_unit_price
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
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE is_priced)::int,
    COALESCE(SUM(total_price), 0)::numeric,
    COUNT(*) FILTER (WHERE NOT is_priced)::int
  FROM public.price_plan(_project_id, _region, _quality_tier)
  GROUP BY ROLLUP (csi_division, category)
  ORDER BY csi_division NULLS LAST, category NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.project_pricing_summary(uuid, text, text) TO authenticated;


-- =========================================================================
-- 2) INDUSTRY ADMIN + 5TH KB SCOPE
-- =========================================================================

ALTER TABLE public.industries
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

UPDATE public.industries SET id = gen_random_uuid() WHERE id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS industries_id_key ON public.industries(id);

ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_scope_check;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_scope_check
  CHECK (scope IN ('agency','activation_type','activation_type_agency','client','project','industry'));

ALTER TABLE public.knowledge_documents ALTER COLUMN agency_id DROP NOT NULL;

ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_agency_industry_consistent;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_agency_industry_consistent
  CHECK (
    (scope = 'industry' AND agency_id IS NULL)
    OR (scope <> 'industry' AND agency_id IS NOT NULL)
  );

ALTER TABLE public.knowledge_chunks ALTER COLUMN agency_id DROP NOT NULL;

DROP POLICY IF EXISTS "knowledge_documents_select" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Members can view their agency documents" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_select"
  ON public.knowledge_documents FOR SELECT
  USING (
    public.is_super_admin()
    OR (scope = 'industry')
    OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  );

DROP POLICY IF EXISTS "knowledge_documents_insert" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Members can insert documents for their agencies" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_insert"
  ON public.knowledge_documents FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR (
      scope <> 'industry'
      AND agency_id IS NOT NULL
      AND public.is_agency_member(agency_id)
      AND uploaded_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_update" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Members can update their agency documents" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_update"
  ON public.knowledge_documents FOR UPDATE
  USING (
    public.is_super_admin()
    OR (
      scope <> 'industry'
      AND agency_id IS NOT NULL
      AND public.is_agency_member(agency_id)
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_delete" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Members can delete their agency documents" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_delete"
  ON public.knowledge_documents FOR DELETE
  USING (
    public.is_super_admin()
    OR (
      scope <> 'industry'
      AND agency_id IS NOT NULL
      AND public.is_agency_admin(agency_id)
    )
  );

DROP POLICY IF EXISTS "knowledge_chunks_select" ON public.knowledge_chunks;
DROP POLICY IF EXISTS "Members can view their agency chunks" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_select"
  ON public.knowledge_chunks FOR SELECT
  USING (
    public.is_super_admin()
    OR (agency_id IS NULL)
    OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id))
  );

DROP POLICY IF EXISTS "kb_storage_super_admin_industry" ON storage.objects;
CREATE POLICY "kb_storage_super_admin_industry"
  ON storage.objects FOR ALL
  USING (bucket_id = 'knowledge-documents' AND public.is_super_admin())
  WITH CHECK (bucket_id = 'knowledge-documents' AND public.is_super_admin());

CREATE OR REPLACE FUNCTION public.admin_create_industry(
  _slug text,
  _label text,
  _description text DEFAULT NULL,
  _icon text DEFAULT NULL,
  _vocabulary jsonb DEFAULT '{}'::jsonb,
  _sort_order int DEFAULT 100
)
RETURNS public.industries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_row public.industries%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  IF length(trim(coalesce(_slug, ''))) < 2 THEN
    RAISE EXCEPTION 'Industry slug must be at least 2 characters' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_label, ''))) < 2 THEN
    RAISE EXCEPTION 'Industry label must be at least 2 characters' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order, is_builtin)
  VALUES (lower(_slug), _label, _description, _icon, COALESCE(_vocabulary, '{}'::jsonb), _sort_order, false)
  RETURNING * INTO new_row;
  RETURN new_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_industry(text, text, text, text, jsonb, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_industry(
  _slug text,
  _label text DEFAULT NULL,
  _description text DEFAULT NULL,
  _icon text DEFAULT NULL,
  _vocabulary jsonb DEFAULT NULL,
  _sort_order int DEFAULT NULL
)
RETURNS public.industries
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  updated_row public.industries%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  UPDATE public.industries
  SET
    label       = COALESCE(_label, label),
    description = COALESCE(_description, description),
    icon        = COALESCE(_icon, icon),
    vocabulary  = COALESCE(_vocabulary, vocabulary),
    sort_order  = COALESCE(_sort_order, sort_order),
    updated_at  = now()
  WHERE slug = _slug
  RETURNING * INTO updated_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Industry % not found', _slug USING ERRCODE = '42704';
  END IF;
  RETURN updated_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_industry(text, text, text, text, jsonb, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_industry(_slug text, _force boolean DEFAULT false)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  agencies_using int;
  is_builtin_row boolean;
BEGIN
  PERFORM public._require_super_admin();
  SELECT is_builtin INTO is_builtin_row FROM public.industries WHERE slug = _slug;
  IF is_builtin_row IS NULL THEN
    RAISE EXCEPTION 'Industry % not found', _slug USING ERRCODE = '42704';
  END IF;
  IF is_builtin_row AND NOT _force THEN
    RAISE EXCEPTION 'Cannot delete a built-in industry without force=true' USING ERRCODE = '42501';
  END IF;
  SELECT COUNT(*) INTO agencies_using FROM public.agencies
  WHERE primary_industry = _slug OR _slug = ANY(industries);
  IF agencies_using > 0 AND NOT _force THEN
    RAISE EXCEPTION 'Industry % is in use by % agencies; pass force=true to delete anyway',
      _slug, agencies_using USING ERRCODE = '23503';
  END IF;
  UPDATE public.agencies SET primary_industry = NULL WHERE primary_industry = _slug;
  UPDATE public.agencies SET industries = array_remove(industries, _slug) WHERE _slug = ANY(industries);
  UPDATE public.activation_types SET industries = array_remove(industries, _slug) WHERE _slug = ANY(industries);
  DELETE FROM public.industries WHERE slug = _slug;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_industry(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_activation_type_industries(
  _activation_type_id uuid,
  _industries text[]
)
RETURNS public.activation_types
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  resolved text[];
  updated_row public.activation_types%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  resolved := ARRAY(
    SELECT s FROM unnest(coalesce(_industries, ARRAY[]::text[])) s
    WHERE EXISTS (SELECT 1 FROM public.industries WHERE slug = s)
  );
  UPDATE public.activation_types
  SET industries = resolved
  WHERE id = _activation_type_id
  RETURNING * INTO updated_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activation type % not found', _activation_type_id USING ERRCODE = '42704';
  END IF;
  RETURN updated_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_activation_type_industries(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_industries_for_admin()
RETURNS TABLE (
  id                    uuid,
  slug                  text,
  label                 text,
  description           text,
  icon                  text,
  vocabulary            jsonb,
  sort_order            int,
  is_builtin            boolean,
  project_type_count    int,
  agency_count          int,
  primary_agency_count  int,
  knowledge_doc_count   int,
  created_at            timestamptz,
  updated_at            timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN QUERY
  SELECT
    i.id, i.slug, i.label, i.description, i.icon, i.vocabulary, i.sort_order, i.is_builtin,
    (SELECT COUNT(*)::int FROM public.activation_types at WHERE i.slug = ANY(at.industries)),
    (SELECT COUNT(*)::int FROM public.agencies a WHERE i.slug = ANY(a.industries) OR a.primary_industry = i.slug),
    (SELECT COUNT(*)::int FROM public.agencies a WHERE a.primary_industry = i.slug),
    (SELECT COUNT(*)::int FROM public.knowledge_documents kd
       WHERE kd.scope = 'industry' AND kd.scope_id = i.id),
    i.created_at, i.updated_at
  FROM public.industries i
  ORDER BY i.sort_order ASC, i.label ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_industries_for_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_activation_types_by_industry(_industry_slug text)
RETURNS TABLE (
  id                  uuid,
  slug                text,
  label               text,
  description         text,
  icon                text,
  category            text,
  default_scale       text,
  default_sqft        int,
  industries          text[],
  is_builtin          boolean,
  user_id             uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public._require_super_admin();
  RETURN QUERY
  SELECT at.id, at.slug, at.label, at.description, at.icon, at.category,
    at.default_scale, at.default_sqft, at.industries, at.is_builtin, at.user_id
  FROM public.activation_types at
  WHERE _industry_slug = ANY(at.industries)
  ORDER BY at.is_builtin DESC, at.category, at.label;
END;
$$;
GRANT EXECUTE ON FUNCTION public.list_activation_types_by_industry(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.industry_uuid(_slug text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.industries WHERE slug = _slug; $$;
GRANT EXECUTE ON FUNCTION public.industry_uuid(text) TO authenticated;


-- =========================================================================
-- 3) LOCK INDUSTRY ISOLATION
-- =========================================================================

DROP FUNCTION IF EXISTS public.update_my_agency_industries(text, text[]);

CREATE OR REPLACE FUNCTION public.admin_set_agency_industries(
  _agency_id        uuid,
  _primary_industry text,
  _industries       text[]
)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  resolved_primary    text;
  resolved_industries text[];
  updated_row         public.agencies%ROWTYPE;
BEGIN
  PERFORM public._require_super_admin();
  resolved_primary := coalesce(_primary_industry, 'experiential');
  IF NOT EXISTS (SELECT 1 FROM public.industries WHERE slug = resolved_primary) THEN
    RAISE EXCEPTION 'Unknown industry: %', resolved_primary USING ERRCODE = '22023';
  END IF;
  resolved_industries := coalesce(_industries, ARRAY[resolved_primary]);
  IF NOT (resolved_primary = ANY(resolved_industries)) THEN
    resolved_industries := array_append(resolved_industries, resolved_primary);
  END IF;
  resolved_industries := ARRAY(
    SELECT s FROM unnest(resolved_industries) s
    WHERE EXISTS (SELECT 1 FROM public.industries WHERE slug = s)
  );
  UPDATE public.agencies
  SET primary_industry = resolved_primary,
      industries       = resolved_industries,
      updated_at       = now()
  WHERE id = _agency_id
  RETURNING * INTO updated_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency % not found', _agency_id USING ERRCODE = '42704';
  END IF;
  RETURN updated_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_set_agency_industries(uuid, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public._block_industry_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NOT NULL AND public.is_super_admin(caller) THEN
    RETURN NEW;
  END IF;
  IF OLD.primary_industry IS NULL AND NEW.primary_industry IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.primary_industry IS DISTINCT FROM OLD.primary_industry THEN
    RAISE EXCEPTION 'primary_industry is locked once set; contact a platform admin to change it'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.industries IS DISTINCT FROM OLD.industries THEN
    RAISE EXCEPTION 'agency industries are locked once set; contact a platform admin to change them'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_agency_industries ON public.agencies;
CREATE TRIGGER trg_lock_agency_industries
  BEFORE UPDATE OF primary_industry, industries ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public._block_industry_self_change();


-- =========================================================================
-- 4) RE-SEED INDUSTRIES + ~40 BUILT-IN PROJECT TYPES
-- =========================================================================

INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order, is_builtin)
VALUES
  ('experiential','Experiential & Trade Show',
   'Brand activations, trade show booths, pop-ups, event marketing.',
   'Sparkles',
   jsonb_build_object('project_type','Activation type','project_types','Activation types','project','Activation','projects','Activations','deliverable','Render package','render','Booth render','spatial_plan','Floor plan','brief','Brief','client','Client'),
   10, true),
  ('architecture','Architecture & Construction',
   'Residential, commercial, hospitality, and civic buildings — new builds and renovations.',
   'Building2',
   jsonb_build_object('project_type','Project type','project_types','Project types','project','Project','projects','Projects','deliverable','Drawing set','render','Architectural rendering','spatial_plan','Floor plan','brief','Project brief','client','Client'),
   20, true),
  ('landscape','Landscape & Site Design',
   'Gardens, parks, plazas, streetscapes, restoration, and site planning.',
   'TreePine',
   jsonb_build_object('project_type','Project type','project_types','Project types','project','Site','projects','Sites','deliverable','Site plan package','render','Site rendering','spatial_plan','Site plan','brief','Site brief','client','Client'),
   30, true),
  ('entertainment','Entertainment & Production',
   'Film, TV, theatrical, themed entertainment, concerts, and live events.',
   'Film',
   jsonb_build_object('project_type','Production type','project_types','Production types','project','Production','projects','Productions','deliverable','Set design package','render','Set rendering','spatial_plan','Stage plan','brief','Production brief','client','Production company'),
   40, true),
  ('audio_visual','A/V Integration & Install',
   'Audio-visual systems for corporate, hospitality, education, worship, residential.',
   'Speaker',
   jsonb_build_object('project_type','System type','project_types','System types','project','Install','projects','Installs','deliverable','Equipment list & layout','render','System rendering','spatial_plan','Equipment layout','brief','Scope of work','client','Client'),
   50, true)
ON CONFLICT (slug) DO NOTHING;

UPDATE public.industries SET id = gen_random_uuid() WHERE id IS NULL;

INSERT INTO public.activation_types (slug, label, description, category, industries, is_builtin)
VALUES
  ('arch_single_family',          'Single-family home',         'New custom home or spec home for a single family.',                'residential',  ARRAY['architecture'], true),
  ('arch_multi_family',           'Multi-family residential',   'Apartments, condos, townhomes — small to mid-rise.',                'residential',  ARRAY['architecture'], true),
  ('arch_residential_renovation', 'Residential renovation',     'Whole-home or major rooms — kitchens, bathrooms, basements.',       'residential',  ARRAY['architecture'], true),
  ('arch_residential_addition',   'Residential addition',       'Additions, second-stories, accessory dwelling units (ADUs).',       'residential',  ARRAY['architecture'], true),
  ('arch_office_buildout',        'Office buildout',            'Commercial office tenant improvement or new lease space.',          'commercial',   ARRAY['architecture'], true),
  ('arch_retail_store',           'Retail store',               'Storefront design, flagship, branded retail.',                      'commercial',   ARRAY['architecture'], true),
  ('arch_restaurant',             'Restaurant',                 'Restaurant interior + exterior, ranging from QSR to fine dining.',  'hospitality',  ARRAY['architecture'], true),
  ('arch_hotel',                  'Hotel / hospitality',        'Hotels, resorts, inns, boutique lodging.',                          'hospitality',  ARRAY['architecture'], true),
  ('arch_mixed_use',              'Mixed-use development',      'Combined residential + commercial + civic in one development.',     'commercial',   ARRAY['architecture'], true),
  ('arch_civic',                  'Civic / public building',    'Schools, libraries, government buildings, transit, museums.',       'civic',        ARRAY['architecture'], true),
  ('arch_healthcare',             'Healthcare facility',        'Clinics, hospital wings, dental, vet, urgent care.',                'civic',        ARRAY['architecture'], true),
  ('arch_industrial',             'Industrial / warehouse',     'Logistics, manufacturing, distribution, data centers.',             'commercial',   ARRAY['architecture'], true),
  ('land_residential_garden',     'Residential garden',         'Front/backyard, courtyards, edible gardens.',                       'residential',  ARRAY['landscape'], true),
  ('land_residential_estate',     'Residential estate',         'Large-property estate landscaping with multiple zones.',            'residential',  ARRAY['landscape'], true),
  ('land_public_park',            'Public park',                'Neighborhood parks, dog parks, plazas, pocket parks.',              'civic',        ARRAY['landscape'], true),
  ('land_streetscape',            'Urban streetscape',          'Streetscapes, complete streets, road diets, public realm.',         'civic',        ARRAY['landscape'], true),
  ('land_commercial_plaza',       'Commercial plaza',           'Office campus plazas, retail center landscapes.',                   'commercial',   ARRAY['landscape'], true),
  ('land_rooftop',                'Rooftop / green roof',       'Green roofs, rooftop gardens, rooftop bars and amenities.',         'commercial',   ARRAY['landscape'], true),
  ('land_sports_rec',             'Sports & recreation',        'Sports fields, golf, tennis, parks-and-recreation amenities.',      'civic',        ARRAY['landscape'], true),
  ('land_restoration',            'Ecological restoration',     'Wetland, prairie, riparian restoration projects.',                  'civic',        ARRAY['landscape'], true),
  ('ent_feature_film',            'Feature film set',           'Theatrical feature film production design.',                        'film',         ARRAY['entertainment'], true),
  ('ent_episodic',                'Episodic series set',        'Multi-episode TV / streaming series sets.',                         'film',         ARRAY['entertainment'], true),
  ('ent_commercial',              'Commercial / spot set',      '15s–60s commercial production for brands and advertisers.',         'film',         ARRAY['entertainment'], true),
  ('ent_music_video',             'Music video set',            'Music video production design — performance and narrative.',        'film',         ARRAY['entertainment'], true),
  ('ent_theatrical',              'Theatrical set',             'Stage set design for theater, opera, dance, musical.',              'live',         ARRAY['entertainment'], true),
  ('ent_immersive_theater',       'Immersive / experiential theater', 'Walk-through, durational, site-specific live experiences.', 'live',         ARRAY['entertainment'], true),
  ('ent_concert_tour',            'Concert tour stage',         'Headline tour main stage + production design package.',             'live',         ARRAY['entertainment'], true),
  ('ent_festival_stage',          'Festival stage',             'Festival main stage / second stage / dance tent.',                  'live',         ARRAY['entertainment'], true),
  ('ent_themed_attraction',       'Themed attraction',          'Theme park rides, dark rides, themed restaurant, escape rooms.',    'themed',       ARRAY['entertainment'], true),
  ('ent_esports',                 'Esports / gaming venue',     'Esports arenas, gaming venues, branded gaming activations.',        'live',         ARRAY['entertainment'], true),
  ('av_conference_room',          'Conference room AV',         'Huddle through executive boardroom — displays, cameras, mics, control.', 'commercial', ARRAY['audio_visual'], true),
  ('av_boardroom',                'Executive boardroom',        'Premium boardroom with multi-display + UC + acoustics.',                 'commercial', ARRAY['audio_visual'], true),
  ('av_classroom',                'Classroom / training',       'Education / training rooms — displays, lecture capture, mics.',          'civic',      ARRAY['audio_visual'], true),
  ('av_lecture_hall',             'Lecture hall / auditorium',  'Large lecture halls + auditoriums.',                                     'civic',      ARRAY['audio_visual'], true),
  ('av_house_of_worship',         'House of worship',           'Church / synagogue / mosque AV — sound, video, streaming.',              'civic',      ARRAY['audio_visual'], true),
  ('av_restaurant',               'Restaurant / hospitality',   'Restaurants, bars, hotels — distributed audio + video.',                 'hospitality', ARRAY['audio_visual'], true),
  ('av_retail',                   'Retail signage / digital',   'Digital signage, queue-management, in-store experience.',                'commercial', ARRAY['audio_visual'], true),
  ('av_home_theater',             'Home theater',               'Residential dedicated home theater + media room.',                       'residential', ARRAY['audio_visual'], true),
  ('av_smart_home',               'Smart home / whole-home audio', 'Whole-home automation, audio distribution, lighting integration.',    'residential', ARRAY['audio_visual'], true),
  ('av_command_control',          'Command & control',          'Operations centers, security ops, broadcast control rooms.',             'commercial', ARRAY['audio_visual'], true),
  ('av_stadium_arena',            'Stadium / arena',            'Venue-scale AV — scoreboards, distributed audio, broadcast.',            'live',       ARRAY['audio_visual'], true),
  ('av_corporate_lobby',          'Corporate lobby / video wall', 'Lobby video walls, branded signage, donor displays.',                  'commercial', ARRAY['audio_visual'], true)
ON CONFLICT (slug) DO UPDATE SET
  industries = CASE
    WHEN public.activation_types.industries IS NULL OR cardinality(public.activation_types.industries) = 0
      THEN EXCLUDED.industries
    ELSE public.activation_types.industries
  END;

UPDATE public.activation_types
SET industries = ARRAY['experiential']
WHERE is_builtin = true
  AND (industries IS NULL OR cardinality(industries) = 0);

CREATE OR REPLACE FUNCTION public.seed_canopy_defaults()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  industries_before int; industries_after int;
  types_before int; types_after int;
BEGIN
  PERFORM public._require_super_admin();
  SELECT COUNT(*) INTO industries_before FROM public.industries;
  SELECT COUNT(*) INTO types_before FROM public.activation_types WHERE is_builtin = true;

  INSERT INTO public.industries (slug, label, description, icon, vocabulary, sort_order, is_builtin) VALUES
    ('experiential','Experiential & Trade Show','Brand activations, trade show booths, pop-ups, event marketing.','Sparkles',
     jsonb_build_object('project_type','Activation type','project_types','Activation types','project','Activation','projects','Activations','deliverable','Render package','render','Booth render','spatial_plan','Floor plan','brief','Brief','client','Client'),10,true),
    ('architecture','Architecture & Construction','Residential, commercial, hospitality, and civic buildings — new builds and renovations.','Building2',
     jsonb_build_object('project_type','Project type','project_types','Project types','project','Project','projects','Projects','deliverable','Drawing set','render','Architectural rendering','spatial_plan','Floor plan','brief','Project brief','client','Client'),20,true),
    ('landscape','Landscape & Site Design','Gardens, parks, plazas, streetscapes, restoration, and site planning.','TreePine',
     jsonb_build_object('project_type','Project type','project_types','Project types','project','Site','projects','Sites','deliverable','Site plan package','render','Site rendering','spatial_plan','Site plan','brief','Site brief','client','Client'),30,true),
    ('entertainment','Entertainment & Production','Film, TV, theatrical, themed entertainment, concerts, and live events.','Film',
     jsonb_build_object('project_type','Production type','project_types','Production types','project','Production','projects','Productions','deliverable','Set design package','render','Set rendering','spatial_plan','Stage plan','brief','Production brief','client','Production company'),40,true),
    ('audio_visual','A/V Integration & Install','Audio-visual systems for corporate, hospitality, education, worship, residential.','Speaker',
     jsonb_build_object('project_type','System type','project_types','System types','project','Install','projects','Installs','deliverable','Equipment list & layout','render','System rendering','spatial_plan','Equipment layout','brief','Scope of work','client','Client'),50,true)
  ON CONFLICT (slug) DO NOTHING;

  UPDATE public.industries SET id = gen_random_uuid() WHERE id IS NULL;

  SELECT COUNT(*) INTO industries_after FROM public.industries;
  SELECT COUNT(*) INTO types_after FROM public.activation_types WHERE is_builtin = true;
  RETURN jsonb_build_object(
    'industries_before', industries_before,
    'industries_after',  industries_after,
    'industries_added',  industries_after - industries_before,
    'types_before',      types_before,
    'types_after',       types_after
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.seed_canopy_defaults() TO authenticated;
