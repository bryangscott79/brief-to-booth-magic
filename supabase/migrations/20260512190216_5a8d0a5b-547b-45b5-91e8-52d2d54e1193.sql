
-- Tighten storage RLS for rhino-renders (paths are `{user.id}/...`)
DROP POLICY IF EXISTS "Users can upload rhino renders" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own rhino renders" ON storage.objects;

CREATE POLICY "Users can upload their own rhino renders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'rhino-renders'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own rhino renders"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'rhino-renders'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Tighten storage RLS for project-images: ownership verified via project_images table.
-- Note: production writes go through an edge function using the service role,
-- which bypasses RLS — these policies just close the client-side hole.
DROP POLICY IF EXISTS "Users can upload project images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their project images" ON storage.objects;

CREATE POLICY "Users can upload their own project images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-images'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own project images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-images'
  AND EXISTS (
    SELECT 1 FROM public.project_images pi
    WHERE pi.storage_path = storage.objects.name
      AND pi.user_id = auth.uid()
  )
);
