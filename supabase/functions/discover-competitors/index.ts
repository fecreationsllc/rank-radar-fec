import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.4/cors";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN")!;
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD")!;
    const dfAuth = "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Get client
    const { data: client } = await supabase.from("clients").select("*").eq("id", client_id).single();
    if (!client) throw new Error("Client not found");

    // Get primary city
    const { data: cities } = await supabase.from("client_cities").select("*").eq("client_id", client_id).eq("is_primary", true).limit(1);
    const primaryCity = cities?.[0];
    if (!primaryCity) throw new Error("No primary city found");

    // Call DataForSEO competitors endpoint
    const res = await fetch("https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live", {
      method: "POST",
      headers: { Authorization: dfAuth, "Content-Type": "application/json" },
      body: JSON.stringify([{
        target: client.domain,
        language_name: "English",
        location_code: primaryCity.location_code,
        limit: 20,
      }]),
    });

    const data = await res.json();
    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];

    // Filter out client's own domain and take top 7
    const competitors = items
      .filter((item: any) => item.domain && !item.domain.includes(client.domain))
      .slice(0, 7)
      .map((item: any) => ({
        client_id,
        domain: item.domain,
        is_auto_discovered: true,
        is_tracked: true,
      }));

    // Upsert competitors
    if (competitors.length > 0) {
      await supabase.from("competitors").upsert(competitors, { onConflict: "client_id,domain" });
    }

    // Return inserted competitors
    const { data: allCompetitors } = await supabase.from("competitors").select("*").eq("client_id", client_id);

    return new Response(JSON.stringify({ competitors: allCompetitors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("discover-competitors error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
