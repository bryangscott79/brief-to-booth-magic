
-- =========================================================
-- 1. Profiles table (stores email + display_name per user)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL UNIQUE,
  email        TEXT,
  display_name TEXT,
  avatar_url   TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 2. Platform invites table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.platform_invites (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  invited_by   UUID NOT NULL,
  accepted_at  TIMESTAMP WITH TIME ZONE,
  expires_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage platform invites"
  ON public.platform_invites FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 3. Admin function: get all user profiles
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_all_user_profiles()
RETURNS TABLE (
  user_id      UUID,
  email        TEXT,
  display_name TEXT,
  avatar_url   TEXT,
  is_admin     BOOLEAN,
  created_at   TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.email,
    p.display_name,
    p.avatar_url,
    EXISTS(
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = p.user_id AND ur.role = 'admin'
    ) AS is_admin,
    p.created_at
  FROM public.profiles p
  WHERE has_role(auth.uid(), 'admin'::app_role)
  ORDER BY p.created_at ASC;
$$;
