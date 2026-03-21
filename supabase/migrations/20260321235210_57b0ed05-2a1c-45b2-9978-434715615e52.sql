
-- ─── 1. Admin roles ───────────────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

CREATE TABLE public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  role       public.app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security-definer helper so policies never recurse
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Admins can read all roles; members can see their own
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

-- Only admins can assign roles
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- ─── 2. Admins can read all projects ─────────────────────────────────────────
CREATE POLICY "Admins can view all projects"
  ON public.projects FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ─── 3. Custom / AI-detected project types ───────────────────────────────────
CREATE TABLE public.custom_project_types (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  type_id          text NOT NULL,
  label            text NOT NULL,
  short_label      text,
  tagline          text,
  description      text,
  icon             text DEFAULT '🏷️',
  accent_color     text DEFAULT 'hsl(220 70% 55%)',
  render_context   text,
  spatial_unit     text DEFAULT 'sqft',
  default_size     integer DEFAULT 1000,
  is_ai_detected   boolean NOT NULL DEFAULT false,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  source_brief_id  uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at       timestamp with time zone NOT NULL DEFAULT now(),
  updated_at       timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, type_id)
);

ALTER TABLE public.custom_project_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom types"
  ON public.custom_project_types FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own custom types"
  ON public.custom_project_types FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom types"
  ON public.custom_project_types FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom types"
  ON public.custom_project_types FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_custom_project_types_updated_at
  BEFORE UPDATE ON public.custom_project_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admins can also see custom types of all users
CREATE POLICY "Admins can view all custom types"
  ON public.custom_project_types FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
