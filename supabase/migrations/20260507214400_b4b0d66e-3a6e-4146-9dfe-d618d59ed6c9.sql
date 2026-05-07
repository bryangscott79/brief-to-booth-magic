CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  agency_id uuid,
  user_id uuid,
  project_id uuid,
  feature text NOT NULL,
  model text NOT NULL,
  provider text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  duration_ms integer,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created_at ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_agency_id ON public.ai_usage_events (agency_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_id ON public.ai_usage_events (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_feature ON public.ai_usage_events (feature);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins view all ai usage" ON public.ai_usage_events;
CREATE POLICY "Super admins view all ai usage" ON public.ai_usage_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Agency admins view their agency ai usage" ON public.ai_usage_events;
CREATE POLICY "Agency admins view their agency ai usage" ON public.ai_usage_events
  FOR SELECT TO authenticated
  USING (agency_id IS NOT NULL AND public.is_agency_admin(agency_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.ai_usage_fleet_totals(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to   timestamptz DEFAULT now()
)
RETURNS TABLE (total_calls bigint, total_input_tokens bigint, total_output_tokens bigint, total_cost_usd numeric, unique_agencies bigint, unique_users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::bigint, COALESCE(sum(input_tokens),0)::bigint, COALESCE(sum(output_tokens),0)::bigint,
         COALESCE(sum(cost_usd),0)::numeric, count(DISTINCT agency_id)::bigint, count(DISTINCT user_id)::bigint
  FROM public.ai_usage_events
  WHERE created_at >= _from AND created_at < _to AND public.is_super_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.ai_usage_by_agency(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to   timestamptz DEFAULT now()
)
RETURNS TABLE (agency_id uuid, agency_name text, calls bigint, total_tokens bigint, cost_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.agency_id, a.name, count(*)::bigint,
         COALESCE(sum(e.input_tokens + e.output_tokens),0)::bigint, COALESCE(sum(e.cost_usd),0)::numeric
  FROM public.ai_usage_events e
  LEFT JOIN public.agencies a ON a.id = e.agency_id
  WHERE e.created_at >= _from AND e.created_at < _to AND public.is_super_admin(auth.uid())
  GROUP BY e.agency_id, a.name
  ORDER BY 5 DESC;
$$;

CREATE OR REPLACE FUNCTION public.ai_usage_by_user(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to   timestamptz DEFAULT now()
)
RETURNS TABLE (user_id uuid, user_email text, calls bigint, total_tokens bigint, cost_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.user_id, p.email, count(*)::bigint,
         COALESCE(sum(e.input_tokens + e.output_tokens),0)::bigint, COALESCE(sum(e.cost_usd),0)::numeric
  FROM public.ai_usage_events e
  LEFT JOIN public.profiles p ON p.user_id = e.user_id
  WHERE e.created_at >= _from AND e.created_at < _to AND public.is_super_admin(auth.uid())
  GROUP BY e.user_id, p.email
  ORDER BY 5 DESC;
$$;

CREATE OR REPLACE FUNCTION public.ai_usage_by_feature(
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to   timestamptz DEFAULT now()
)
RETURNS TABLE (feature text, model text, calls bigint, total_tokens bigint, cost_usd numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.feature, e.model, count(*)::bigint,
         COALESCE(sum(e.input_tokens + e.output_tokens),0)::bigint, COALESCE(sum(e.cost_usd),0)::numeric
  FROM public.ai_usage_events e
  WHERE e.created_at >= _from AND e.created_at < _to AND public.is_super_admin(auth.uid())
  GROUP BY e.feature, e.model
  ORDER BY 5 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ai_usage_fleet_totals(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_by_agency(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_by_user(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_by_feature(timestamptz, timestamptz) TO authenticated;