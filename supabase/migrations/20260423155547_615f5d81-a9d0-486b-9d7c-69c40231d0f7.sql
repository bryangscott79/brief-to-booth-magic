
-- ═══════════════════════════════════════════════════════════════════════════
-- VOLTA RAG — Phase 1 Foundation
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. AGENCIES + MEMBERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,
  owner_user_id   uuid NOT NULL,
  logo_url        text,
  brand_colors    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agency_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  invited_by  uuid,
  UNIQUE (agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS agency_members_user_id_idx ON public.agency_members(user_id);
CREATE INDEX IF NOT EXISTS agency_members_agency_id_idx ON public.agency_members(agency_id);

-- Pending invites (used for both agency members and platform super_admin)
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  invite_type  text NOT NULL CHECK (invite_type IN ('agency_member','super_admin')),
  agency_id    uuid REFERENCES public.agencies(id) ON DELETE CASCADE,
  role         text,
  invited_by   uuid NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '14 days')
);

CREATE INDEX IF NOT EXISTS pending_invites_email_idx ON public.pending_invites(lower(email));
CREATE INDEX IF NOT EXISTS pending_invites_agency_idx ON public.pending_invites(agency_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SECURITY DEFINER HELPERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_agency_member(_agency_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE agency_id = _agency_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin(_agency_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_members
    WHERE agency_id = _agency_id
      AND user_id = _user_id
      AND role IN ('owner','admin')
  )
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS — AGENCIES & MEMBERS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agencies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_invites   ENABLE ROW LEVEL SECURITY;

-- Agencies
CREATE POLICY "Members can view their agencies"
  ON public.agencies FOR SELECT
  USING (public.is_agency_member(id) OR public.is_super_admin());

CREATE POLICY "Authenticated users can create agencies"
  ON public.agencies FOR INSERT
  WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owners and admins can update agencies"
  ON public.agencies FOR UPDATE
  USING (public.is_agency_admin(id) OR public.is_super_admin());

CREATE POLICY "Owners can delete agencies"
  ON public.agencies FOR DELETE
  USING (auth.uid() = owner_user_id OR public.is_super_admin());

-- Agency members
CREATE POLICY "Members can view memberships of their agencies"
  ON public.agency_members FOR SELECT
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

CREATE POLICY "Admins can insert members"
  ON public.agency_members FOR INSERT
  WITH CHECK (public.is_agency_admin(agency_id) OR public.is_super_admin() OR auth.uid() = user_id);

CREATE POLICY "Admins can update members"
  ON public.agency_members FOR UPDATE
  USING (public.is_agency_admin(agency_id) OR public.is_super_admin());

CREATE POLICY "Admins can delete members"
  ON public.agency_members FOR DELETE
  USING (public.is_agency_admin(agency_id) OR public.is_super_admin() OR auth.uid() = user_id);

-- Pending invites
CREATE POLICY "Admins can view their agency invites"
  ON public.pending_invites FOR SELECT
  USING (
    (invite_type = 'agency_member' AND agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
    OR (invite_type = 'super_admin' AND public.is_super_admin())
    OR (lower(email) = lower(coalesce((auth.jwt() ->> 'email'), '')))
  );

CREATE POLICY "Admins can create invites"
  ON public.pending_invites FOR INSERT
  WITH CHECK (
    invited_by = auth.uid()
    AND (
      (invite_type = 'agency_member' AND agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
      OR (invite_type = 'super_admin' AND public.is_super_admin())
    )
  );

CREATE POLICY "Admins can cancel invites"
  ON public.pending_invites FOR DELETE
  USING (
    (invite_type = 'agency_member' AND agency_id IS NOT NULL AND public.is_agency_admin(agency_id))
    OR (invite_type = 'super_admin' AND public.is_super_admin())
    OR invited_by = auth.uid()
  );

CREATE POLICY "Anyone can update an invite they accept"
  ON public.pending_invites FOR UPDATE
  USING (
    lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    OR public.is_super_admin()
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. KNOWLEDGE DOCUMENTS + CHUNKS (pgvector)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Scope: which level of the RAG hierarchy this doc belongs to
  scope               text NOT NULL CHECK (scope IN ('agency','activation_type','client','project')),
  scope_id            uuid NOT NULL,  -- agency.id, activation_types.id, clients.id, or projects.id

  -- File metadata
  filename            text NOT NULL,
  title               text,
  summary             text,
  doc_type            text,           -- brief | rate_card | research | past_work | brand_guide | spec_sheet | contract | other
  storage_bucket      text NOT NULL DEFAULT 'knowledge-documents',
  storage_path        text NOT NULL,
  mime_type           text,
  file_size_bytes     bigint,

  -- Tagging
  auto_tags           text[] NOT NULL DEFAULT '{}',
  user_tags           text[] NOT NULL DEFAULT '{}',

  -- Processing state
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','embedded','failed')),
  processing_error    text,
  chunk_count         integer NOT NULL DEFAULT 0,
  extracted_text      text,
  metadata            jsonb,

  uploaded_by         uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_documents_agency_idx ON public.knowledge_documents(agency_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_scope_idx ON public.knowledge_documents(scope, scope_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx ON public.knowledge_documents(status);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  agency_id       uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Denormalized scope for fast filtering
  scope           text NOT NULL,
  scope_id        uuid NOT NULL,

  chunk_index     integer NOT NULL,
  content         text NOT NULL,
  token_count     integer,
  embedding       vector(768),     -- gemini-embedding-001 with outputDimensionality=768
  metadata        jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Vector + filter indexes
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS knowledge_chunks_scope_idx
  ON public.knowledge_chunks(agency_id, scope, scope_id);

CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx
  ON public.knowledge_chunks(document_id);

-- BM25-ish full-text index
CREATE INDEX IF NOT EXISTS knowledge_chunks_content_fts_idx
  ON public.knowledge_chunks
  USING gin (to_tsvector('english', content));

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS — KNOWLEDGE DOCS & CHUNKS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their agency documents"
  ON public.knowledge_documents FOR SELECT
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

CREATE POLICY "Members can insert documents for their agencies"
  ON public.knowledge_documents FOR INSERT
  WITH CHECK (public.is_agency_member(agency_id) AND uploaded_by = auth.uid());

CREATE POLICY "Members can update their agency documents"
  ON public.knowledge_documents FOR UPDATE
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

CREATE POLICY "Members can delete their agency documents"
  ON public.knowledge_documents FOR DELETE
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

CREATE POLICY "Members can view their agency chunks"
  ON public.knowledge_chunks FOR SELECT
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

-- chunks are written/deleted only by service role (edge function), but allow
-- delete by agency members so deleting a parent document can cascade properly
CREATE POLICY "Members can delete their agency chunks"
  ON public.knowledge_chunks FOR DELETE
  USING (public.is_agency_member(agency_id) OR public.is_super_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. STORAGE BUCKET + POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-documents', 'knowledge-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Agency members can read their knowledge files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'knowledge-documents'
    AND (
      public.is_agency_member((string_to_array(name, '/'))[1]::uuid)
      OR public.is_super_admin()
    )
  );

CREATE POLICY "Agency members can upload knowledge files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'knowledge-documents'
    AND auth.uid() IS NOT NULL
    AND public.is_agency_member((string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY "Agency members can delete their knowledge files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'knowledge-documents'
    AND (
      public.is_agency_member((string_to_array(name, '/'))[1]::uuid)
      OR public.is_super_admin()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RPCs — TEAM MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.list_agency_members(_agency_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  email text,
  role text,
  joined_at timestamptz,
  is_primary_owner boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    am.id,
    am.user_id,
    coalesce(p.email, '') AS email,
    am.role,
    am.joined_at,
    (a.owner_user_id = am.user_id) AS is_primary_owner
  FROM public.agency_members am
  JOIN public.agencies a ON a.id = am.agency_id
  LEFT JOIN public.profiles p ON p.user_id = am.user_id
  WHERE am.agency_id = _agency_id
    AND (public.is_agency_member(_agency_id) OR public.is_super_admin())
  ORDER BY am.joined_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.list_super_admins()
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ur.user_id,
    coalesce(p.email, '') AS email,
    ur.created_at
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role::text = 'super_admin'
    AND public.is_super_admin()
  ORDER BY ur.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.revoke_super_admin(_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can revoke super_admin role';
  END IF;
  DELETE FROM public.user_roles
  WHERE user_id = _target_user_id AND role::text = 'super_admin';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_pending_invites()
RETURNS TABLE (
  id uuid,
  invite_type text,
  agency_id uuid,
  agency_name text,
  role text,
  invited_by uuid,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    pi.id,
    pi.invite_type,
    pi.agency_id,
    a.name AS agency_name,
    pi.role,
    pi.invited_by,
    pi.created_at,
    pi.expires_at
  FROM public.pending_invites pi
  LEFT JOIN public.agencies a ON a.id = pi.agency_id
  WHERE lower(pi.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    AND pi.status = 'pending'
    AND pi.expires_at > now()
  ORDER BY pi.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.accept_pending_invite(_invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_invite public.pending_invites%ROWTYPE;
  v_email  text;
BEGIN
  v_email := lower(coalesce((auth.jwt() ->> 'email'), ''));
  IF v_email = '' THEN
    RAISE EXCEPTION 'No authenticated email';
  END IF;

  SELECT * INTO v_invite
  FROM public.pending_invites
  WHERE id = _invite_id
    AND lower(email) = v_email
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found, expired, or not addressed to you';
  END IF;

  IF v_invite.invite_type = 'agency_member' AND v_invite.agency_id IS NOT NULL THEN
    INSERT INTO public.agency_members (agency_id, user_id, role, invited_by)
    VALUES (v_invite.agency_id, auth.uid(), coalesce(v_invite.role, 'member'), v_invite.invited_by)
    ON CONFLICT (agency_id, user_id) DO UPDATE
      SET role = EXCLUDED.role;
  ELSIF v_invite.invite_type = 'super_admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (auth.uid(), 'super_admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.pending_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = _invite_id;

  RETURN true;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. RPC — HYBRID VECTOR + BM25 SEARCH
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  _agency_id uuid,
  _query_embedding vector(768),
  _query_text text,
  _scopes text[],
  _scope_ids uuid[],
  _match_count int DEFAULT 8,
  _vector_weight float DEFAULT 0.7
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  content text,
  scope text,
  scope_id uuid,
  similarity float,
  bm25_score float,
  hybrid_score float,
  metadata jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      1 - (kc.embedding <=> _query_embedding) AS similarity,
      ts_rank_cd(
        to_tsvector('english', kc.content),
        plainto_tsquery('english', _query_text)
      ) AS bm25_score
    FROM public.knowledge_chunks kc
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
    (_vector_weight * f.similarity + (1 - _vector_weight) * f.bm25_score) AS hybrid_score,
    f.metadata
  FROM filtered f
  ORDER BY (_vector_weight * f.similarity + (1 - _vector_weight) * f.bm25_score) DESC
  LIMIT _match_count;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. AUTO-CREATE AGENCY ON FIRST SIGN-IN
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ensure_agency_for_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_slug text;
  v_email text;
BEGIN
  -- Skip if user already belongs to an agency
  IF EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  v_email := coalesce(NEW.email, NEW.display_name, NEW.user_id::text);
  v_slug := lower(regexp_replace(split_part(v_email, '@', 1) || '-' || substring(NEW.user_id::text, 1, 6), '[^a-z0-9-]', '-', 'g'));

  INSERT INTO public.agencies (name, slug, owner_user_id)
  VALUES (
    coalesce(NEW.display_name, split_part(v_email, '@', 1), 'My agency'),
    v_slug,
    NEW.user_id
  )
  RETURNING id INTO v_agency_id;

  INSERT INTO public.agency_members (agency_id, user_id, role)
  VALUES (v_agency_id, NEW.user_id, 'owner');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_agency_on_profile_insert ON public.profiles;
CREATE TRIGGER create_agency_on_profile_insert
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_agency_for_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. updated_at TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS update_agencies_updated_at ON public.agencies;
CREATE TRIGGER update_agencies_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_knowledge_documents_updated_at ON public.knowledge_documents;
CREATE TRIGGER update_knowledge_documents_updated_at
  BEFORE UPDATE ON public.knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. BACKFILL — create an agency for every existing profile
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  v_agency_id uuid;
  v_slug text;
  v_email text;
BEGIN
  FOR r IN
    SELECT p.user_id, p.email, p.display_name
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.agency_members am WHERE am.user_id = p.user_id
    )
  LOOP
    v_email := coalesce(r.email, r.display_name, r.user_id::text);
    v_slug := lower(regexp_replace(
      split_part(v_email, '@', 1) || '-' || substring(r.user_id::text, 1, 6),
      '[^a-z0-9-]', '-', 'g'
    ));

    INSERT INTO public.agencies (name, slug, owner_user_id)
    VALUES (
      coalesce(r.display_name, split_part(v_email, '@', 1), 'My agency'),
      v_slug,
      r.user_id
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_agency_id;

    -- if slug collided, fetch the agency we (or someone else) just created for this owner
    IF v_agency_id IS NULL THEN
      SELECT id INTO v_agency_id FROM public.agencies WHERE owner_user_id = r.user_id LIMIT 1;
    END IF;

    IF v_agency_id IS NOT NULL THEN
      INSERT INTO public.agency_members (agency_id, user_id, role)
      VALUES (v_agency_id, r.user_id, 'owner')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
