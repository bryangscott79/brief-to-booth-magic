-- Fix cross-tenant storage access for brand-assets and company-assets.
-- Replaces the wide-open policies that only checked bucket_id with path-based
-- ownership / agency-membership checks.

-- Drop existing wide-open policies -------------------------------------------------
DROP POLICY IF EXISTS "brand-assets_insert_authed" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets_update_authed" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets_read_authed" ON storage.objects;
DROP POLICY IF EXISTS "brand-assets_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "company-assets_insert_authed" ON storage.objects;
DROP POLICY IF EXISTS "company-assets_update_authed" ON storage.objects;
DROP POLICY IF EXISTS "company-assets_read_authed" ON storage.objects;
DROP POLICY IF EXISTS "company-assets_delete_own" ON storage.objects;

-- Helper: brand-assets path is {uploader_user_id}/{client_id}/{filename}.
-- An agency member may access a file if the client belongs to their agency.
CREATE OR REPLACE FUNCTION public.is_brand_asset_client_member(_path text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.agency_members owner ON owner.user_id = c.user_id
    JOIN public.agency_members me ON me.agency_id = owner.agency_id
    WHERE c.id = (string_to_array(_path, '/'))[2]::uuid
      AND me.user_id = _user_id
  )
$$;

-- Helper: brand-assets may be managed by the original uploader or an agency owner/admin.
CREATE OR REPLACE FUNCTION public.can_manage_brand_asset(_path text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.agency_members owner ON owner.user_id = c.user_id
    JOIN public.agency_members me ON me.agency_id = owner.agency_id
    WHERE c.id = (string_to_array(_path, '/'))[2]::uuid
      AND me.user_id = _user_id
      AND (
        (string_to_array(_path, '/'))[1]::uuid = _user_id
        OR me.role IN ('owner', 'admin')
      )
  )
$$;

-- Helper: company-assets supports agency/{agency_id}/{file} and legacy {user_id}/logos/{file}.
CREATE OR REPLACE FUNCTION public.can_access_company_asset(_path text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN split_part(_path, '/', 1) = 'agency' THEN
      public.is_agency_member(split_part(_path, '/', 2)::uuid, _user_id)
    WHEN split_part(_path, '/', 2) = 'logos' THEN
      split_part(_path, '/', 1)::uuid = _user_id
    ELSE false
  END
$$;

-- brand-assets policies ------------------------------------------------------------
-- Read: any member of the client's agency (or super admin).
CREATE POLICY "brand-assets_read_authed"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.is_brand_asset_client_member(name)
    )
  );

-- Insert: uploader must be the current user and the client must belong to their agency.
CREATE POLICY "brand-assets_insert_authed"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR (
        (string_to_array(name, '/'))[1]::uuid = auth.uid()
        AND public.is_brand_asset_client_member(name)
      )
    )
  );

-- Update: original uploader or agency owner/admin (or super admin).
CREATE POLICY "brand-assets_update_authed"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_brand_asset(name)
    )
  )
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_brand_asset(name)
    )
  );

-- Delete: same control as update.
CREATE POLICY "brand-assets_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_manage_brand_asset(name)
    )
  );

-- company-assets policies --------------------------------------------------------
CREATE POLICY "company-assets_read_authed"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_access_company_asset(name)
    )
  );

CREATE POLICY "company-assets_insert_authed"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_access_company_asset(name)
    )
  );

CREATE POLICY "company-assets_update_authed"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_access_company_asset(name)
    )
  )
  WITH CHECK (
    bucket_id = 'company-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_access_company_asset(name)
    )
  );

CREATE POLICY "company-assets_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-assets'
    AND (
      public.is_super_admin(auth.uid())
      OR public.can_access_company_asset(name)
    )
  );