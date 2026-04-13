CREATE TABLE public.api_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  function_name text NOT NULL,
  api_provider text NOT NULL,
  endpoint text,
  task_count integer DEFAULT 1,
  cost_usd numeric(10,6) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON public.api_usage_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.api_usage_log FOR ALL TO service_role USING (true) WITH CHECK (true);