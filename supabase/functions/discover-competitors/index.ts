import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    // Get client
    const { data: client } = await supabase.from("clients").select("*").eq("id", client_id).single();
    if (!client) throw new Error("Client not found");

    // Get primary city
    const { data: cities } = await supabase.from("client_cities").select("*").eq("client_id", client_id).eq("is_primary", true).limit(1);
    const primaryCity = cities?.[0];
    if (!primaryCity) throw new Error("No primary city found");

    // Fetch keywords and GSC data in parallel
    const [keywordsRes, gscRes] = await Promise.all([
      supabase.from("keywords").select("keyword, status").eq("client_id", client_id).limit(30),
      supabase.from("gsc_query_data").select("query, impressions, position").eq("client_id", client_id).order("impressions", { ascending: false }).limit(30),
    ]);

    const keywords = keywordsRes.data ?? [];
    const gscQueries = gscRes.data ?? [];

    const keywordLines = keywords.map((k: any) => `- "${k.keyword}" (${k.status})`).join("\n");
    const gscLines = gscQueries.map((g: any) => `- "${g.query}" | ${g.impressions} impressions | pos ${Math.round(g.position || 0)}`).join("\n");

    const prompt = `You are an SEO expert. Given the following local business website and their keyword data, identify exactly 6 realistic local/regional competitor domains that would compete for the same keywords in the same geographic area.

BUSINESS DOMAIN: ${client.domain}
LOCATION: ${primaryCity.city_name}

TRACKED KEYWORDS:
${keywordLines || "No keywords tracked yet."}

TOP GOOGLE SEARCH CONSOLE QUERIES:
${gscLines || "No GSC data available."}

RULES:
- Return ONLY real competing local businesses — companies that serve the same area and offer similar services
- Do NOT include any of these types of sites: yelp.com, homeadvisor.com, thumbtack.com, yellowpages.com, angieslist.com, angi.com, google.com, facebook.com, instagram.com, amazon.com, bbb.org, mapquest.com, manta.com, nextdoor.com, linkedin.com, twitter.com, x.com, pinterest.com, youtube.com, wikipedia.org, reddit.com
- Do NOT include any national directories, aggregators, social media platforms, or review sites
- Do NOT include "${client.domain}" itself
- Return exactly 6 domains as a JSON array of strings, e.g. ["competitor1.com", "competitor2.com", ...]
- Return ONLY the JSON array, no other text`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const anthropicData = await anthropicRes.json();
    const responseText = anthropicData.content?.[0]?.text ?? "[]";

    // Parse JSON array from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Failed to parse AI response");

    const domains: string[] = JSON.parse(jsonMatch[0]);

    const competitors = domains
      .filter((d: string) => d && !d.includes(client.domain))
      .slice(0, 6)
      .map((domain: string) => ({
        client_id,
        domain: domain.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
        is_auto_discovered: true,
        is_tracked: true,
      }));

    if (competitors.length > 0) {
      await supabase.from("competitors").upsert(competitors, { onConflict: "client_id,domain" });
    }

    // Log API cost
    await supabase.from("api_usage_log").insert({
      client_id,
      function_name: "discover-competitors",
      api_provider: "anthropic",
      endpoint: "messages",
      task_count: 1,
      cost_usd: 0.003,
    });

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
