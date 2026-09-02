-- 1. agency_members: remove the self-insert hole. All legitimate membership
-- creation happens via SECURITY DEFINER RPCs (create agency, accept invite)
-- or the admin-invite-user edge function, so client inserts are never needed.
DROP POLICY IF EXISTS "Admins can insert members" ON public.agency_members;
CREATE POLICY "Admins can insert members"
ON public.agency_members FOR INSERT TO authenticated
WITH CHECK (public.is_agency_admin(agency_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- 2. feedback-attachments: scope reads to the uploader, super admins, or
-- owners/admins of the agency whose feedback row references the file.
DROP POLICY IF EXISTS feedback_attachments_read ON storage.objects;
CREATE POLICY feedback_attachments_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.agency_id IS NOT NULL
        AND public.is_agency_admin(f.agency_id, auth.uid())
        AND f.attachments::text LIKE '%' || name || '%'
    )
  )
);