import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BLOCKLIST = new Set([
  "yelp.com",
  "yellowpages.com",
  "homeadvisor.com",
  "angi.com",
  "thumbtack.com",
  "bbb.org",
  "google.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "linkedin.com",
  "pinterest.com",
  "youtube.com",
  "amazon.com",
  "wikipedia.org",
  "reddit.com",
  "nextdoor.com",
  "mapquest.com",
  "apple.com",
  "x.com",
  "manta.com",
  "angieslist.com",
]);

function isBlocked(domain: string): boolean {
  if (BLOCKLIST.has(domain)) return true;
  if (domain.includes("yelp") || domain.includes("google")) return true;
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN")!;
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD")!;
    const authHeader =
      "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Fetch client + primary city in parallel
    const [clientRes, citiesRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", client_id).single(),
      supabase
        .from("client_cities")
        .select("*")
        .eq("client_id", client_id)
        .eq("is_primary", true)
        .limit(1),
    ]);

    const client = clientRes.data;
    if (!client) throw new Error("Client not found");
    const primaryCity = citiesRes.data?.[0];
    if (!primaryCity) throw new Error("No primary city found");

    // Get top 5 GSC queries aggregated by impressions
    const { data: gscRows } = await supabase
      .from("gsc_query_data")
      .select("query, impressions")
      .eq("client_id", client_id)
      .order("impressions", { ascending: false })
      .limit(50);

    let searchQueries: string[] = [];

    if (gscRows && gscRows.length > 0) {
      const queryMap = new Map<string, number>();
      for (const row of gscRows) {
        queryMap.set(
          row.query,
          (queryMap.get(row.query) || 0) + (row.impressions || 0)
        );
      }
      searchQueries = Array.from(queryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([q]) => q);
    }

    // Fallback to keywords table
    if (searchQueries.length === 0) {
      const { data: kwRows } = await supabase
        .from("keywords")
        .select("keyword")
        .eq("client_id", client_id)
        .order("created_at", { ascending: true })
        .limit(5);
      searchQueries = (kwRows || []).map((k: any) => k.keyword);
    }

    if (searchQueries.length === 0) {
      throw new Error(
        "No GSC queries or keywords found to discover competitors"
      );
    }

    console.log(
      `Discovering competitors for client ${client_id} using ${searchQueries.length} queries:`,
      searchQueries
    );

    // SERP lookups via DataForSEO
    const frequencyMap = new Map<string, number>();
    let taskCount = 0;
    const serpErrors: string[] = [];
    let firstSerpRawResponse: any = null;
    let firstSerpItemCount: number = 0;
    let firstSerpStatus: number | null = null;

    for (const keyword of searchQueries) {
      try {
        const serpRes = await fetch(
          "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([
              {
                keyword,
                location_code: primaryCity.location_code,
                language_code: "en",
                depth: 20,
              },
            ]),
          }
        );

        taskCount++;
        const serpData = await serpRes.json();
        const items = serpData?.tasks?.[0]?.result?.[0]?.items || [];

        if (taskCount === 1) {
          firstSerpRawResponse = serpData;
          firstSerpItemCount = items.length;
          firstSerpStatus = serpData?.status_code ?? null;
        }

        for (const item of items) {
          if (item.type !== "organic" || !item.domain) continue;
          const domain = item.domain.replace(/^www\./, "");
          if (
            domain === client.domain ||
            domain === `www.${client.domain}` ||
            isBlocked(domain)
          )
            continue;
          frequencyMap.set(domain, (frequencyMap.get(domain) || 0) + 1);
        }
      } catch (e) {
        console.error(`SERP lookup failed for "${keyword}":`, e);
        serpErrors.push(`SERP failed for "${keyword}": ${(e as Error).message}`);
      }
    }

    console.log(
      `Found ${frequencyMap.size} unique domains across ${taskCount} SERP calls`
    );

    // Sort by frequency, take top 6
    const topDomains = Array.from(frequencyMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([domain]) => ({
        client_id,
        domain,
        is_auto_discovered: true,
        is_tracked: true,
      }));

    if (topDomains.length > 0) {
      await supabase
        .from("competitors")
        .upsert(topDomains, { onConflict: "client_id,domain" });
    }

    // Log API cost
    await supabase.from("api_usage_log").insert({
      client_id,
      function_name: "discover-competitors",
      api_provider: "dataforseo",
      endpoint: "serp/google/organic/live/advanced",
      task_count: taskCount,
      cost_usd: 0.002 * taskCount,
    });

    const { data: allCompetitors } = await supabase
      .from("competitors")
      .select("*")
      .eq("client_id", client_id);

    return new Response(JSON.stringify({
      competitors: allCompetitors,
      debug: {
        gscRowCount: gscRows?.length || 0,
        searchQueries,
        locationCode: primaryCity.location_code,
        taskCount,
        uniqueDomainsFound: frequencyMap.size,
        serpErrors,
        firstSerpRawResponse,
        firstSerpItemCount,
        firstSerpStatus,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("discover-competitors error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
