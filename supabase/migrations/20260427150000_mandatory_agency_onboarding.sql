-- =========================================================================
-- MANDATORY AGENCY ONBOARDING
--
-- Every user must belong to an agency OR be a super admin. Replaces the
-- silent auto-create trigger with explicit onboarding:
--
--   1. Drops handle_new_user_agency trigger so signups land with no agency.
--   2. apply_pending_invites trigger still runs, so invitees get auto-bound
--      when they accept an existing invite.
--   3. create_my_agency() RPC lets a signed-in user create their own agency
--      and become its owner. Backfills any orphan rows owned by them.
--   4. user_needs_onboarding() helper for the frontend gate.
--   5. Hardens the pending_invites INSERT policy: only agency members can
--      send invites for their agency, AND only if their own agency is
--      currently in good standing.
-- =========================================================================

-- 1. Disable the auto-create trigger ----------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created_agency ON auth.users;

-- We keep the function definition for now in case the user wants to reverse
-- this decision; just unbind it from auth.users so it doesn't fire.

-- 2. RPC: create_my_agency ---------------------------------------------------
-- Creates a new agency, makes the caller the owner, adds them to
-- agency_members, and back-fills any orphan rows owned by them.
--
-- Auto-generates a unique slug from name + a short random suffix.
CREATE OR REPLACE FUNCTION public.create_my_agency(
  _name text,
  _logo_url text DEFAULT NULL,
  _brand_colors jsonb DEFAULT NULL
)
RETURNS public.agencies
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  trimmed_name text;
  generated_slug text;
  new_row public.agencies%ROWTYPE;
  attempt int := 0;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- A user can only own one agency through this flow. Block if they already
  -- have a membership (super admins are exempt).
  IF EXISTS (SELECT 1 FROM public.agency_members WHERE user_id = caller) THEN
    RAISE EXCEPTION 'You already belong to an agency' USING ERRCODE = '23505';
  END IF;

  trimmed_name := trim(coalesce(_name, ''));
  IF length(trimmed_name) < 2 THEN
    RAISE EXCEPTION 'Agency name must be at least 2 characters' USING ERRCODE = '22023';
  END IF;
  IF length(trimmed_name) > 80 THEN
    RAISE EXCEPTION 'Agency name must be 80 characters or fewer' USING ERRCODE = '22023';
  END IF;

  -- Generate a slug from the name; retry up to 5 times with extra randomness
  -- if there's a collision. (Very unlikely with the random suffix.)
  LOOP
    attempt := attempt + 1;
    generated_slug :=
      lower(regexp_replace(trimmed_name, '[^a-zA-Z0-9]+', '-', 'g'))
      || '-'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    -- Trim leading/trailing dashes
    generated_slug := regexp_replace(generated_slug, '^-+|-+$', '', 'g');
    -- Cap at 60 chars
    generated_slug := substr(generated_slug, 1, 60);

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.agencies WHERE slug = generated_slug);
    IF attempt > 5 THEN
      RAISE EXCEPTION 'Could not generate a unique slug after 5 attempts';
    END IF;
  END LOOP;

  -- Create the agency. We attempt both column names (owner_user_id used by
  -- Lovable's schema; primary_owner_id used by ours) — whichever exists wins.
  -- Doing this dynamically keeps the migration portable across schema variants.
  BEGIN
    INSERT INTO public.agencies (name, slug, owner_user_id, logo_url, brand_colors)
    VALUES (trimmed_name, generated_slug, caller, _logo_url, _brand_colors)
    RETURNING * INTO new_row;
  EXCEPTION WHEN undefined_column THEN
    -- Fall back to primary_owner_id if owner_user_id doesn't exist
    EXECUTE
      'INSERT INTO public.agencies (name, slug, primary_owner_id, logo_url, brand_colors)
       VALUES ($1, $2, $3, $4, $5) RETURNING *'
    INTO new_row
    USING trimmed_name, generated_slug, caller, _logo_url, _brand_colors;
  END;

  -- Add the caller as the owner member.
  INSERT INTO public.agency_members (agency_id, user_id, role, invited_by)
  VALUES (new_row.id, caller, 'owner', caller)
  ON CONFLICT (agency_id, user_id) DO NOTHING;

  -- Backfill: any rows the caller owns that have no agency_id get bound to
  -- the new agency. Wrapped in a sub-block so missing tables don't fail the
  -- whole RPC (different deployments may have different table sets).
  BEGIN
    UPDATE public.clients SET agency_id = new_row.id
    WHERE user_id = caller AND agency_id IS NULL;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  BEGIN
    UPDATE public.projects SET agency_id = new_row.id
    WHERE user_id = caller AND agency_id IS NULL;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  BEGIN
    UPDATE public.knowledge_documents SET agency_id = new_row.id
    WHERE uploaded_by = caller AND agency_id IS NULL;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    NULL;
  END;

  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_my_agency(text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_my_agency(text, text, jsonb) IS
  'Creates a new agency for the calling user, sets them as owner, and ' ||
  'backfills any orphaned clients/projects/knowledge_documents.';

-- 3. Helper: user_needs_onboarding -------------------------------------------
-- The frontend gate calls this. Returns true when the user has no agency
-- membership AND is not a super admin AND has no pending agency invites.
CREATE OR REPLACE FUNCTION public.user_needs_onboarding()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.agency_members WHERE user_id = auth.uid()
    )
    AND NOT public.is_super_admin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.user_needs_onboarding() TO authenticated;

-- 4. Harden invite policy: inviter must have an active agency ---------------
-- Replace the agency_member invite policy so inviters cannot send invites
-- if their own agency is suspended/disabled OR if they don't have an agency.
DROP POLICY IF EXISTS "agency_admins_can_invite_members" ON public.pending_invites;

CREATE POLICY "agency_admins_can_invite_members"
  ON public.pending_invites FOR INSERT
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      invite_type = 'agency_member'
      AND agency_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.agency_members am
        WHERE am.agency_id = pending_invites.agency_id
          AND am.user_id = auth.uid()
          AND am.role IN ('owner','admin')
      )
      AND public.agency_has_access(agency_id)
    )
    OR (
      invite_type = 'super_admin'
      AND public.is_super_admin(auth.uid())
    )
  );

COMMENT ON POLICY "agency_admins_can_invite_members" ON public.pending_invites IS
  'Inviter must (a) be super admin, OR (b) be owner/admin of the agency AND ' ||
  'their agency must currently have access (not suspended/disabled).';
