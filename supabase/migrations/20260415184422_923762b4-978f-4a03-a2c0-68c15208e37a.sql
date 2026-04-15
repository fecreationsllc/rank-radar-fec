
CREATE TABLE public.client_gsc_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_gsc_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access"
ON public.client_gsc_connections
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Service role full access"
ON public.client_gsc_connections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
