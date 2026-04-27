-- =========================================================================
-- INDUSTRY ADMIN + 5TH KB SCOPE
--
-- Super admins gain full CRUD over industries + the activation/project
-- types mapped to each. Adds a fifth knowledge scope ('industry') so
-- super admins can curate global, industry-specific knowledge that flows
-- into every agency working in that industry.
--
-- Key changes:
--   1. industries gains a stable uuid id (alongside slug) for use as
--      knowledge_documents.scope_id.
--   2. knowledge_documents + knowledge_chunks: scope CHECK now includes
--      'industry'; agency_id is nullable (null for global industry docs).
--   3. RLS: industry docs are readable by every authenticated user but
--      only writable by super admins.
--   4. New super-admin RPCs:
--        admin_create_industry, admin_update_industry, admin_delete_industry,
--        admin_set_activation_type_industries,
--        list_industries_for_admin, list_activation_types_by_industry
-- =========================================================================

-- 1. Stable uuid on industries -----------------------------------------------
ALTER TABLE public.industries
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

-- Make sure every existing row has a unique uuid
UPDATE public.industries SET id = gen_random_uuid() WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS industries_id_key ON public.industries(id);

COMMENT ON COLUMN public.industries.id IS
  'Stable uuid for use as knowledge_documents.scope_id when scope=industry. ' ||
  'slug remains the natural key.';

-- 2. Knowledge tables: 5th scope + nullable agency_id -----------------------
-- Drop existing scope checks to widen them.
ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_scope_check;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_scope_check
  CHECK (scope IN ('agency','activation_type','client','project','industry'));

ALTER TABLE public.knowledge_documents ALTER COLUMN agency_id DROP NOT NULL;

-- For industry scope rows, agency_id MUST be null. Enforce with a
-- partial check.
ALTER TABLE public.knowledge_documents DROP CONSTRAINT IF EXISTS knowledge_documents_agency_industry_consistent;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT knowledge_documents_agency_industry_consistent
  CHECK (
    (scope = 'industry' AND agency_id IS NULL)
    OR (scope <> 'industry' AND agency_id IS NOT NULL)
  );

ALTER TABLE public.knowledge_chunks ALTER COLUMN agency_id DROP NOT NULL;

-- 3. RLS: industry knowledge readable by everyone, writable only by super admins ----
-- Find existing policies to update; use names defensively.

-- Read: a user can read agency-scoped docs they're a member of, OR any industry-scoped doc.
DROP POLICY IF EXISTS "knowledge_documents_select" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_select"
  ON public.knowledge_documents FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (scope = 'industry')
    OR (agency_id IS NOT NULL AND public.is_agency_member(auth.uid(), agency_id))
  );

-- Insert: agency-scoped → must be a member of the agency with access; industry-scoped → super admin only.
DROP POLICY IF EXISTS "knowledge_documents_insert" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_insert"
  ON public.knowledge_documents FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      scope <> 'industry'
      AND agency_id IS NOT NULL
      AND public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_update" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_update"
  ON public.knowledge_documents FOR UPDATE
  USING (
    public.is_super_admin(auth.uid())
    OR (
      scope <> 'industry'
      AND agency_id IS NOT NULL
      AND public.is_agency_member(auth.uid(), agency_id)
      AND public.agency_has_access(agency_id)
    )
  );

DROP POLICY IF EXISTS "knowledge_documents_delete" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_delete"
  ON public.knowledge_documents FOR DELETE
  USING (
    public.is_super_admin(auth.uid())
    OR (
      scope <> 'industry'
      AND agency_id IS NOT NULL
      AND public.is_agency_admin(auth.uid(), agency_id)
    )
  );

-- Same shape for knowledge_chunks
DROP POLICY IF EXISTS "knowledge_chunks_select" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_select"
  ON public.knowledge_chunks FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (agency_id IS NULL)
    OR (agency_id IS NOT NULL AND public.is_agency_member(auth.uid(), agency_id))
  );

-- 4. Storage bucket policy: super admins can write industry docs ------------
-- The knowledge-documents bucket already lets agency members write under
-- {agency_id}/... — for industry scope, super admins write under
-- "industry/{industry_uuid}/..." (no agency_id segment).
DROP POLICY IF EXISTS "kb_storage_super_admin_industry" ON storage.objects;
CREATE POLICY "kb_storage_super_admin_industry"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'knowledge-documents'
    AND public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'knowledge-documents'
    AND public.is_super_admin(auth.uid())
  );

-- 5. Super-admin industry RPCs ----------------------------------------------

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

-- Delete: blocks if any agency still uses the industry, unless _force is true.
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
      _slug, agencies_using
      USING ERRCODE = '23503';
  END IF;

  -- Detach from agencies
  UPDATE public.agencies SET primary_industry = NULL
   WHERE primary_industry = _slug;
  UPDATE public.agencies SET industries = array_remove(industries, _slug)
   WHERE _slug = ANY(industries);

  -- Detach from activation_types
  UPDATE public.activation_types SET industries = array_remove(industries, _slug)
   WHERE _slug = ANY(industries);

  DELETE FROM public.industries WHERE slug = _slug;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_industry(text, boolean) TO authenticated;

-- Assign / replace the industries array on a single activation type.
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

  -- Drop unknown slugs
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

-- Aggregated view for the /admin/industries page: counts of types + agencies + KB docs per industry.
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
    i.id,
    i.slug,
    i.label,
    i.description,
    i.icon,
    i.vocabulary,
    i.sort_order,
    i.is_builtin,
    (SELECT COUNT(*)::int FROM public.activation_types at WHERE i.slug = ANY(at.industries)),
    (SELECT COUNT(*)::int FROM public.agencies a WHERE i.slug = ANY(a.industries) OR a.primary_industry = i.slug),
    (SELECT COUNT(*)::int FROM public.agencies a WHERE a.primary_industry = i.slug),
    (SELECT COUNT(*)::int FROM public.knowledge_documents kd
       WHERE kd.scope = 'industry' AND kd.scope_id = i.id),
    i.created_at,
    i.updated_at
  FROM public.industries i
  ORDER BY i.sort_order ASC, i.label ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_industries_for_admin() TO authenticated;

-- All activation types tagged with a given industry (visible to super admins).
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
  SELECT
    at.id, at.slug, at.label, at.description, at.icon, at.category,
    at.default_scale, at.default_sqft, at.industries, at.is_builtin,
    at.user_id
  FROM public.activation_types at
  WHERE _industry_slug = ANY(at.industries)
  ORDER BY at.is_builtin DESC, at.category, at.label;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_activation_types_by_industry(text) TO authenticated;

-- 6. Helper: lookup an industry uuid from slug (used by frontend) ----------
CREATE OR REPLACE FUNCTION public.industry_uuid(_slug text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.industries WHERE slug = _slug;
$$;

GRANT EXECUTE ON FUNCTION public.industry_uuid(text) TO authenticated;
