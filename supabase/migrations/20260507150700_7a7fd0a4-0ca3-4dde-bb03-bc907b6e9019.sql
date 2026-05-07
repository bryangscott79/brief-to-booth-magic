
-- Tighten project_invites SELECT: remove public-read; allow only creator or invited user
DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.project_invites;

CREATE POLICY "Invite participants can read"
ON public.project_invites
FOR SELECT
USING (
  auth.uid() = created_by
  OR auth.uid() = accepted_by
  OR (email IS NOT NULL AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
);

-- Atomic, safe token-based acceptance via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.accept_project_invite(_token text)
RETURNS public.project_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.project_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invite
  FROM public.project_invites
  WHERE token = _token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invite link' USING ERRCODE = '22023';
  END IF;

  UPDATE public.project_invites
  SET accepted_at = now(),
      accepted_by = auth.uid()
  WHERE id = v_invite.id
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_project_invite(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_project_invite(text) TO authenticated;
