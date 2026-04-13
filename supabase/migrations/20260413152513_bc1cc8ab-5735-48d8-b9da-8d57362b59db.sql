
CREATE TABLE public.gsc_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gsc_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON public.gsc_connections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.gsc_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.gsc_query_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  query text NOT NULL,
  clicks integer DEFAULT 0,
  impressions integer DEFAULT 0,
  ctr numeric(6,4) DEFAULT 0,
  position numeric(6,2) DEFAULT 0,
  date date NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gsc_query_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON public.gsc_query_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.gsc_query_data FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_gsc_query_data_client ON public.gsc_query_data(client_id);
CREATE INDEX idx_gsc_query_data_date ON public.gsc_query_data(client_id, date);
