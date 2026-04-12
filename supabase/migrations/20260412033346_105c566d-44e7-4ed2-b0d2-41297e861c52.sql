
CREATE TABLE public.keyword_search_volume (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES public.keywords(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.client_cities(id) ON DELETE CASCADE,
  search_volume integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(keyword_id, city_id)
);

ALTER TABLE public.keyword_search_volume ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON public.keyword_search_volume FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public read access" ON public.keyword_search_volume FOR SELECT TO anon USING (true);
CREATE POLICY "Service role full access" ON public.keyword_search_volume FOR ALL TO service_role USING (true) WITH CHECK (true);
