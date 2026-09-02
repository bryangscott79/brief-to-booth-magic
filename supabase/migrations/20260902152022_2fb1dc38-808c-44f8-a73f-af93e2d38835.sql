DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['company-assets', 'brand-assets'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                   AND policyname = b || '_insert_authed') THEN
      EXECUTE format($p$ CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = %L) $p$, b || '_insert_authed', b);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                   AND policyname = b || '_update_authed') THEN
      EXECUTE format($p$ CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated
        USING (bucket_id = %L) $p$, b || '_update_authed', b);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                   AND policyname = b || '_read_authed') THEN
      EXECUTE format($p$ CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = %L) $p$, b || '_read_authed', b);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
                   AND policyname = b || '_delete_own') THEN
      EXECUTE format($p$ CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = %L AND (owner = auth.uid() OR public.is_super_admin(auth.uid()))) $p$,
        b || '_delete_own', b);
    END IF;
  END LOOP;
END $$;