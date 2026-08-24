-- Feedback / bug & feature tracker.
-- Any authenticated user can submit; agency admins (owner/admin) review their
-- agency's queue; super admins review everything. Reviewers set status,
-- priority, and internal notes to shape feature builds.
--
-- NOTE (workflow): hand-authored migrations are NOT auto-applied to the hosted
-- DB. Run this file's contents in the Supabase SQL editor for project
-- kjbamfitkaxnfyppplaq (or via Lovable). The frontend detects the missing
-- table and shows a setup notice until this is applied.

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  submitter_email text,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'bug'
    CHECK (type IN ('bug', 'feature', 'improvement')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description text,
  page_path text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'under_review', 'planned', 'in_progress', 'shipped', 'declined')),
  priority text
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_agency ON public.feedback (agency_id, status);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON public.feedback (user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.feedback (created_at DESC);

CREATE TRIGGER update_feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can file feedback as themselves.
CREATE POLICY feedback_insert_own ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Submitters always see their own submissions (status/priority included, so
-- they can watch progress).
CREATE POLICY feedback_select_own ON public.feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Agency admins/owners see their agency's queue; super admins see everything.
CREATE POLICY feedback_select_review ON public.feedback
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.agency_id = feedback.agency_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  );

-- Only reviewers can triage (status / priority / notes).
CREATE POLICY feedback_update_review ON public.feedback
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.agency_id = feedback.agency_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.agency_id = feedback.agency_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'admin')
    )
  );

-- Hard delete is platform-owner only.
CREATE POLICY feedback_delete_super ON public.feedback
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ── v2 addendum: screenshot attachments ─────────────────────────────────────
-- Safe to run standalone if the section above was already applied.

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Public bucket (same posture as project-images): unguessable per-user paths,
-- served by public URL so reviewer thumbnails render without signing.
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-attachments', 'feedback-attachments', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'feedback_attachments_insert_own'
  ) THEN
    EXECUTE $p$
      CREATE POLICY feedback_attachments_insert_own ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'feedback-attachments'
          AND (storage.foldername(name))[1] = auth.uid()::text
        )
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'feedback_attachments_read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY feedback_attachments_read ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'feedback-attachments')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'feedback_attachments_delete_own'
  ) THEN
    EXECUTE $p$
      CREATE POLICY feedback_attachments_delete_own ON storage.objects
        FOR DELETE TO authenticated
        USING (
          bucket_id = 'feedback-attachments'
          AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR public.is_super_admin(auth.uid())
          )
        )
    $p$;
  END IF;
END $$;
