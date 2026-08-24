-- One-time cleanup (2026-08-24): the four invited Exhibitus teammates signed
-- in before agency invites existed, so onboarding forced each to create a
-- solo agency. This attaches them to Exhibitus as members and removes the
-- accidental solo agencies (all zero-project). Idempotent — safe to re-run.
--
-- Run in the Supabase SQL editor (project kjbamfitkaxnfyppplaq).

-- 1) Attach the four users to Exhibitus as members
INSERT INTO public.agency_members (agency_id, user_id, role, invited_by)
SELECT a.id, u.id, 'member', a.owner_user_id
FROM public.agencies a
CROSS JOIN auth.users u
WHERE a.slug = 'exhibitus'
  AND lower(u.email) IN (
    'phoebe.mathius@exhibitus.com',
    'david.mclaren@exhibitus.com',
    'ashley.tomashot@exhibitus.com',
    'nigel.wright@exhibitus.com'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.agency_members am
    WHERE am.agency_id = a.id AND am.user_id = u.id
  );

-- 2) Remove their accidental solo agencies (guard: not Exhibitus, no projects)
WITH junk AS (
  SELECT a.id
  FROM public.agencies a
  WHERE a.slug <> 'exhibitus'
    AND a.owner_user_id IN (
      SELECT id FROM auth.users
      WHERE lower(email) IN (
        'phoebe.mathius@exhibitus.com',
        'david.mclaren@exhibitus.com',
        'ashley.tomashot@exhibitus.com',
        'nigel.wright@exhibitus.com'
      )
    )
    AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.agency_id = a.id)
)
DELETE FROM public.agency_members WHERE agency_id IN (SELECT id FROM junk);

WITH junk AS (
  SELECT a.id
  FROM public.agencies a
  WHERE a.slug <> 'exhibitus'
    AND a.owner_user_id IN (
      SELECT id FROM auth.users
      WHERE lower(email) IN (
        'phoebe.mathius@exhibitus.com',
        'david.mclaren@exhibitus.com',
        'ashley.tomashot@exhibitus.com',
        'nigel.wright@exhibitus.com'
      )
    )
    AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.agency_id = a.id)
)
DELETE FROM public.pending_invites WHERE agency_id IN (SELECT id FROM junk);

DELETE FROM public.agencies a
WHERE a.slug <> 'exhibitus'
  AND a.owner_user_id IN (
    SELECT id FROM auth.users
    WHERE lower(email) IN (
      'phoebe.mathius@exhibitus.com',
      'david.mclaren@exhibitus.com',
      'ashley.tomashot@exhibitus.com',
      'nigel.wright@exhibitus.com'
    )
  )
  AND NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.agency_id = a.id);

-- 3) Verify: each user should now show exactly one membership — Exhibitus
SELECT u.email, ag.name AS agency, am.role
FROM public.agency_members am
JOIN auth.users u ON u.id = am.user_id
JOIN public.agencies ag ON ag.id = am.agency_id
WHERE lower(u.email) IN (
  'phoebe.mathius@exhibitus.com',
  'david.mclaren@exhibitus.com',
  'ashley.tomashot@exhibitus.com',
  'nigel.wright@exhibitus.com'
)
ORDER BY u.email;
