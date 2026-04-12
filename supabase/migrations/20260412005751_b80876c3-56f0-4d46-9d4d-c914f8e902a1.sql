
-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  alert_email TEXT,
  report_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create client_cities table
CREATE TABLE public.client_cities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  city_name TEXT NOT NULL,
  location_code INTEGER NOT NULL,
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create keywords table
CREATE TABLE public.keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  target_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create competitors table
CREATE TABLE public.competitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  is_auto_discovered BOOLEAN DEFAULT false,
  is_tracked BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create rank_history table
CREATE TABLE public.rank_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES public.keywords(id) ON DELETE CASCADE,
  city_id UUID NOT NULL REFERENCES public.client_cities(id) ON DELETE CASCADE,
  position INTEGER,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create seo_suggestions table
CREATE TABLE public.seo_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  suggestions JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_rank_history_keyword_checked ON public.rank_history(keyword_id, checked_at DESC);
CREATE INDEX idx_rank_history_city ON public.rank_history(city_id);

-- Enable RLS on all tables
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rank_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_suggestions ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full access on all tables
CREATE POLICY "Authenticated full access" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.client_cities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.keywords FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.competitors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.rank_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access" ON public.seo_suggestions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public SELECT for shareable report pages
CREATE POLICY "Public read access" ON public.clients FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access" ON public.client_cities FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access" ON public.keywords FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access" ON public.rank_history FOR SELECT TO anon USING (true);
CREATE POLICY "Public read access" ON public.seo_suggestions FOR SELECT TO anon USING (true);

-- Service role access for edge functions
CREATE POLICY "Service role full access" ON public.clients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.client_cities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.keywords FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.competitors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.rank_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.seo_suggestions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Unique constraint for competitor upserts
ALTER TABLE public.competitors ADD CONSTRAINT unique_client_competitor UNIQUE (client_id, domain);
