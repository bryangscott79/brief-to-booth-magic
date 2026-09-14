-- Activate the knowledge layer (2026-09-15).
--
-- The RAG system was fully built and completely dead in production. Three
-- independent live defects, each proven against the deployed database:
--
--   D1. public.is_agency_member is overloaded as BOTH
--         (_agency_id uuid, _user_id uuid DEFAULT auth.uid())   -- 2026-04-23
--         (_agency_id uuid)                                     -- 2026-05-07
--       Both are candidates for a one-argument call, so every such call
--       fails at runtime with 42725 "function public.is_agency_member(uuid)
--       is not unique". match_knowledge_chunks guards itself with exactly
--       that call, so EVERY retrieval has thrown since 2026-05-07.
--       Reproduced live: POST /rest/v1/rpc/match_knowledge_chunks -> 42725.
--
--   D2. The knowledge_documents / knowledge_chunks policies call
--         is_agency_member(auth.uid(), agency_id)
--       with the arguments REVERSED (the signature is agency first, user
--       second). They therefore test "is this agency a member of this
--       user", which is never true. Agency members cannot read their own
--       corpus; only super admins and industry-scoped docs are visible,
--       which is why the gap stayed invisible to a super-admin operator.
--
--   D4. public.projects has no agency_id column at all, so nothing can be
--       attributed to an agency at the project level. Several older
--       migrations (mandatory_agency_onboarding, industries_engine,
--       agency_access_control) already write and read projects.agency_id,
--       meaning they have been silently failing or were never applied.
--       Reproduced live: GET /rest/v1/projects?select=agency_id -> 42703.
--
-- (D3 — the client never sending agency_id — is fixed in application code;
-- see src/lib/knowledgeScope.ts.)
--
-- Safe to run more than once.

-- ── D1 · remove the overload ambiguity ──────────────────────────────────────
-- Drop the one-argument wrappers. Single-argument calls then bind
-- unambiguously to the two-argument function, whose _user_id already
-- defaults to auth.uid() — identical semantics, no ambiguity. Nothing can
-- have bound to the wrappers, because any call that could reach them was
-- ambiguous and would have failed to resolve. The guard is belt-and-braces:
-- if some object did depend on one, keep it and fall through to the
-- match_knowledge_chunks rewrite below, which no longer needs either.
DO $$
BEGIN
  BEGIN
    DROP FUNCTION IF EXISTS public.is_agency_member(uuid);
  EXCEPTION WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'is_agency_member(uuid) kept: other objects depend on it';
  END;
  BEGIN
    DROP FUNCTION IF EXISTS public.is_agency_admin(uuid);
  EXCEPTION WHEN dependent_objects_still_exist THEN
    RAISE NOTICE 'is_agency_admin(uuid) kept: other objects depend on it';
  END;
END $$;

-- ── D1 · make the retrieval guard independent of the overload set ───────────
-- Always call the two-argument form explicitly so this function can never
-- be broken again by an overload added elsewhere.
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  _agency_id uuid,
  _query_embedding vector,
  _query_text text,
  _scopes text[],
  _scope_ids uuid[],
  _match_count integer DEFAULT 8,
  _vector_weight double precision DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  content text,
  scope text,
  scope_id uuid,
  similarity double precision,
  bm25_score double precision,
  hybrid_score double precision,
  priority_weight numeric,
  is_pinned boolean,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_agency_member(_agency_id, auth.uid())
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not a member of this agency';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      kc.id AS chunk_id,
      kc.document_id,
      kc.content,
      kc.scope,
      kc.scope_id,
      kc.metadata,
      kd.priority_weight,
      kd.is_pinned,
      1 - (kc.embedding <=> _query_embedding) AS similarity,
      ts_rank_cd(
        to_tsvector('english', kc.content),
        plainto_tsquery('english', _query_text)
      ) AS bm25_score
    FROM public.knowledge_chunks kc
    JOIN public.knowledge_documents kd ON kd.id = kc.document_id
    WHERE kc.agency_id = _agency_id
      AND kc.embedding IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(_scopes, _scope_ids) AS t(s, sid)
        WHERE kc.scope = t.s AND kc.scope_id = t.sid
      )
  )
  SELECT
    f.chunk_id,
    f.document_id,
    f.content,
    f.scope,
    f.scope_id,
    f.similarity,
    f.bm25_score,
    ((_vector_weight * f.similarity) + ((1 - _vector_weight) * f.bm25_score))
      * COALESCE(f.priority_weight, 1.0)::double precision AS hybrid_score,
    f.priority_weight,
    f.is_pinned,
    f.metadata
  FROM filtered f
  ORDER BY hybrid_score DESC
  LIMIT _match_count;
END;
$function$;

-- ── D2 · fix the reversed-argument knowledge policies ───────────────────────
-- Argument order is (agency, user). Every policy below had it backwards.
DROP POLICY IF EXISTS "knowledge_documents_select" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_select"
  ON public.knowledge_documents FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (scope = 'industry')
    OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id, auth.uid()))
  );

DROP POLICY IF EXISTS "knowledge_documents_insert" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_insert"
  ON public.knowledge_documents FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      scope <> 'industry'
      AND agency_id IS NOT NULL
      AND public.is_agency_member(agency_id, auth.uid())
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
      AND public.is_agency_member(agency_id, auth.uid())
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
      AND public.is_agency_admin(agency_id, auth.uid())
    )
  );

-- Chunks follow their document. The previous policy also granted every
-- authenticated user any chunk whose agency_id was NULL; industry-scoped
-- chunks are now matched on scope rather than on a missing owner.
DROP POLICY IF EXISTS "knowledge_chunks_select" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_select"
  ON public.knowledge_chunks FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR (scope = 'industry')
    OR (agency_id IS NOT NULL AND public.is_agency_member(agency_id, auth.uid()))
  );

-- ── D4 · give projects an agency ────────────────────────────────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_agency ON public.projects (agency_id);

-- Backfill: the owner's agency membership, else the client's agency.
UPDATE public.projects p
   SET agency_id = sub.agency_id
  FROM (
    SELECT DISTINCT ON (m.user_id) m.user_id, m.agency_id
      FROM public.agency_members m
     ORDER BY m.user_id, m.joined_at
  ) sub
 WHERE p.agency_id IS NULL
   AND p.user_id = sub.user_id;

UPDATE public.projects p
   SET agency_id = c.agency_id
  FROM public.clients c
 WHERE p.agency_id IS NULL
   AND p.client_id = c.id
   AND c.agency_id IS NOT NULL;

-- Stamp on insert so this can never drift again. A caller-supplied
-- agency_id always wins; otherwise it is derived from the owner.
CREATE OR REPLACE FUNCTION public.stamp_project_agency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.agency_id IS NULL THEN
    SELECT m.agency_id INTO NEW.agency_id
      FROM public.agency_members m
     WHERE m.user_id = NEW.user_id
     ORDER BY m.joined_at
     LIMIT 1;
  END IF;
  IF NEW.agency_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT c.agency_id INTO NEW.agency_id
      FROM public.clients c
     WHERE c.id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_project_agency_trg ON public.projects;
CREATE TRIGGER stamp_project_agency_trg
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.stamp_project_agency();
