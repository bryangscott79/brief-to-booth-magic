
-- 1. Per-document weighting + pinning
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS priority_weight numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.knowledge_documents.priority_weight IS
  'Multiplier applied to chunk hybrid_score after scope-weighting. >1 boosts; <1 demotes.';
COMMENT ON COLUMN public.knowledge_documents.is_pinned IS
  'When true, at least one chunk from this doc is force-injected into retrieval results regardless of score.';

-- 2. Retrieval analytics log
CREATE TABLE IF NOT EXISTS public.rag_query_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid,
  source text NOT NULL DEFAULT 'unknown',
  query text NOT NULL,
  query_truncated text GENERATED ALWAYS AS (substring(query, 1, 500)) STORED,
  scopes text[] NOT NULL DEFAULT '{}',
  scope_ids uuid[] NOT NULL DEFAULT '{}',
  top_k integer NOT NULL DEFAULT 0,
  result_chunk_ids uuid[] NOT NULL DEFAULT '{}',
  result_doc_ids uuid[] NOT NULL DEFAULT '{}',
  reranked boolean NOT NULL DEFAULT false,
  pinned_doc_ids uuid[] NOT NULL DEFAULT '{}',
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rag_query_log_agency_created_idx
  ON public.rag_query_log (agency_id, created_at DESC);

ALTER TABLE public.rag_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view their agency rag log" ON public.rag_query_log;
CREATE POLICY "Members can view their agency rag log"
ON public.rag_query_log
FOR SELECT
USING (public.is_agency_member(agency_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "Members can delete their agency rag log" ON public.rag_query_log;
CREATE POLICY "Members can delete their agency rag log"
ON public.rag_query_log
FOR DELETE
USING (public.is_agency_admin(agency_id) OR public.is_super_admin());

-- 3. Legacy KB migration tracker (idempotent backfill)
CREATE TABLE IF NOT EXISTS public.kb_migration_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_row_id uuid NOT NULL,
  document_id uuid REFERENCES public.knowledge_documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_row_id)
);

ALTER TABLE public.kb_migration_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage migration log" ON public.kb_migration_log;
CREATE POLICY "Super admins manage migration log"
ON public.kb_migration_log
FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 4. Drop & recreate match function with new return type
DROP FUNCTION IF EXISTS public.match_knowledge_chunks(uuid, vector, text, text[], uuid[], integer, double precision);

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
  IF NOT (public.is_agency_member(_agency_id) OR public.is_super_admin()) THEN
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
    (_vector_weight * f.similarity + (1 - _vector_weight) * f.bm25_score) * f.priority_weight AS hybrid_score,
    f.priority_weight,
    f.is_pinned,
    f.metadata
  FROM filtered f
  ORDER BY (_vector_weight * f.similarity + (1 - _vector_weight) * f.bm25_score) * f.priority_weight DESC
  LIMIT _match_count;
END;
$function$;
