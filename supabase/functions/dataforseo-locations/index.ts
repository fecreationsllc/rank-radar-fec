import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || query.length < 3) {
      return new Response(JSON.stringify({ locations: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN")!;
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD")!;
    const dfAuth = "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    const res = await fetch("https://api.dataforseo.com/v3/serp/google/locations", {
      headers: { Authorization: dfAuth },
    });

    const data = await res.json();
    const allLocations = data.tasks?.[0]?.result ?? [];

    // Filter by name match, return top 10
    const filtered = allLocations
      .filter((loc: any) => loc.location_name?.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10)
      .map((loc: any) => ({
        location_name: loc.location_name,
        location_code: loc.location_code,
      }));

    return new Response(JSON.stringify({ locations: filtered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("dataforseo-locations error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
