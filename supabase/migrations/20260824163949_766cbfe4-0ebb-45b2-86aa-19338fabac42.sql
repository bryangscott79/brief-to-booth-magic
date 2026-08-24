ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='feedback_attachments_insert_own') THEN
    EXECUTE $p$ CREATE POLICY feedback_attachments_insert_own ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'feedback-attachments'
                  AND (storage.foldername(name))[1] = auth.uid()::text) $p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='feedback_attachments_read') THEN
    EXECUTE $p$ CREATE POLICY feedback_attachments_read ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'feedback-attachments') $p$;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                 AND policyname='feedback_attachments_delete_own') THEN
    EXECUTE $p$ CREATE POLICY feedback_attachments_delete_own ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'feedback-attachments'
             AND ((storage.foldername(name))[1] = auth.uid()::text
                  OR public.is_super_admin(auth.uid()))) $p$;
  END IF;
END $$;