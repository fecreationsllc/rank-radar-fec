import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN")!;
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD")!;
    const dfAuth = "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Fetch keywords and cities for this client
    const [keywordsRes, citiesRes] = await Promise.all([
      supabase.from("keywords").select("*").eq("client_id", client_id),
      supabase.from("client_cities").select("*").eq("client_id", client_id),
    ]);

    const keywords = keywordsRes.data ?? [];
    const cities = citiesRes.data ?? [];

    if (!keywords.length || !cities.length) {
      return new Response(JSON.stringify({ message: "No keywords or cities" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build tasks — one per city with all keywords
    // DataForSEO allows up to 700 keywords per task
    const upserts: { keyword_id: string; city_id: string; search_volume: number | null }[] = [];

    for (const city of cities) {
      const keywordStrings = keywords.map((k) => k.keyword);

      // Batch in groups of 700
      for (let i = 0; i < keywordStrings.length; i += 700) {
        const batch = keywordStrings.slice(i, i + 700);
        const batchKeywords = keywords.slice(i, i + 700);

        const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
          method: "POST",
          headers: { Authorization: dfAuth, "Content-Type": "application/json" },
          body: JSON.stringify([{
            keywords: batch,
            location_code: city.location_code,
            language_code: "en",
          }]),
        });

        const data = await res.json();
        const results = data.tasks?.[0]?.result ?? [];

        // Map results back to keywords
        for (const result of results) {
          const matchedKw = batchKeywords.find(
            (k) => k.keyword.toLowerCase() === result.keyword?.toLowerCase()
          );
          if (matchedKw) {
            upserts.push({
              keyword_id: matchedKw.id,
              city_id: city.id,
              search_volume: result.search_volume ?? null,
            });
          }
        }
      }
    }

    // Upsert into keyword_search_volume
    if (upserts.length > 0) {
      const { error } = await supabase
        .from("keyword_search_volume")
        .upsert(
          upserts.map((u) => ({
            keyword_id: u.keyword_id,
            city_id: u.city_id,
            search_volume: u.search_volume,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "keyword_id,city_id" }
        );

      if (error) {
        console.error("Upsert error:", error);
        throw new Error(`Failed to upsert search volumes: ${error.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, updated: upserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-search-volume error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
