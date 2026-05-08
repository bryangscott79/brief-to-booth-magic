DO $$
DECLARE
  matt_user_id   uuid;
  matt_agency_id uuid;
  existing_exhibitus_id uuid;
BEGIN
  SELECT id INTO matt_user_id FROM auth.users WHERE email = 'matt.beck@exhibitus.com' LIMIT 1;
  IF matt_user_id IS NULL THEN
    RAISE NOTICE '[exhibitus-rename] matt.beck@exhibitus.com not found — skipping.';
    RETURN;
  END IF;

  SELECT id INTO existing_exhibitus_id FROM public.agencies WHERE slug = 'exhibitus' OR name = 'Exhibitus' LIMIT 1;

  IF existing_exhibitus_id IS NOT NULL THEN
    INSERT INTO public.agency_members (agency_id, user_id, role)
    VALUES (existing_exhibitus_id, matt_user_id, 'owner')
    ON CONFLICT (agency_id, user_id) DO UPDATE SET role = 'owner';

    UPDATE public.agencies
    SET owner_user_id = matt_user_id, updated_at = now()
    WHERE id = existing_exhibitus_id
      AND (owner_user_id IS NULL OR owner_user_id <> matt_user_id);
    RETURN;
  END IF;

  SELECT am.agency_id INTO matt_agency_id
  FROM public.agency_members am
  WHERE am.user_id = matt_user_id
  ORDER BY am.joined_at ASC
  LIMIT 1;

  IF matt_agency_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.agencies
  SET name = 'Exhibitus', slug = 'exhibitus', owner_user_id = matt_user_id, updated_at = now()
  WHERE id = matt_agency_id;

  UPDATE public.agency_members
  SET role = 'owner'
  WHERE agency_id = matt_agency_id AND user_id = matt_user_id;
END;
$$;