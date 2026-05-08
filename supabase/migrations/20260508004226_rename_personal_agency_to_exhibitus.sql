-- =========================================================================
-- Rename Matt Beck's auto-created personal agency to "Exhibitus".
--
-- Background: the ensure_agency_for_user trigger created a personal
-- agency for matt.beck@exhibitus.com on signup (slug=matt.beck). The
-- real Exhibitus agency record was never explicitly created. Renaming
-- the existing UUID preserves all foreign-key references — projects,
-- agency_members, knowledge_documents, project_images, brand intel,
-- AI usage events, etc. — without any data migration.
--
-- Idempotency: guarded DO block. Safe to re-run; no-ops if the user
-- doesn't exist or Exhibitus is already correctly set up.
-- =========================================================================

DO $$
DECLARE
  matt_user_id   uuid;
  matt_agency_id uuid;
  existing_exhibitus_id uuid;
BEGIN
  -- Resolve Matt's auth user. If absent (dev DBs, fresh installs), exit
  -- cleanly so the migration is a no-op rather than a failure.
  SELECT id INTO matt_user_id
  FROM auth.users
  WHERE email = 'matt.beck@exhibitus.com'
  LIMIT 1;

  IF matt_user_id IS NULL THEN
    RAISE NOTICE '[exhibitus-rename] matt.beck@exhibitus.com not found — skipping.';
    RETURN;
  END IF;

  -- If Exhibitus already exists (manual creation, prior run), don't
  -- rename anything; just ensure Matt is an owner-role member.
  SELECT id INTO existing_exhibitus_id
  FROM public.agencies
  WHERE slug = 'exhibitus' OR name = 'Exhibitus'
  LIMIT 1;

  IF existing_exhibitus_id IS NOT NULL THEN
    RAISE NOTICE '[exhibitus-rename] Exhibitus already exists (id=%); ensuring Matt is owner.',
      existing_exhibitus_id;

    INSERT INTO public.agency_members (agency_id, user_id, role)
    VALUES (existing_exhibitus_id, matt_user_id, 'owner')
    ON CONFLICT (agency_id, user_id)
    DO UPDATE SET role = 'owner';

    UPDATE public.agencies
    SET owner_user_id = matt_user_id, updated_at = now()
    WHERE id = existing_exhibitus_id
      AND (owner_user_id IS NULL OR owner_user_id <> matt_user_id);

    RETURN;
  END IF;

  -- Find Matt's oldest membership — that's his auto-created personal
  -- agency. Renaming preserves the UUID so all FK references stay intact.
  -- agency_members tracks `joined_at`, not `created_at`.
  SELECT am.agency_id INTO matt_agency_id
  FROM public.agency_members am
  WHERE am.user_id = matt_user_id
  ORDER BY am.joined_at ASC
  LIMIT 1;

  IF matt_agency_id IS NULL THEN
    RAISE NOTICE '[exhibitus-rename] Matt has no agency_members rows — onboarding flow needed.';
    RETURN;
  END IF;

  UPDATE public.agencies
  SET name          = 'Exhibitus',
      slug          = 'exhibitus',
      owner_user_id = matt_user_id,
      updated_at    = now()
  WHERE id = matt_agency_id;

  -- agency_members has no updated_at column, only role.
  UPDATE public.agency_members
  SET role = 'owner'
  WHERE agency_id = matt_agency_id
    AND user_id   = matt_user_id;

  RAISE NOTICE '[exhibitus-rename] Renamed % to "Exhibitus" (slug=exhibitus); owner=%.',
    matt_agency_id, matt_user_id;
END;
$$;
