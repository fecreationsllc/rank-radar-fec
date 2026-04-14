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

    // Get cities
    const { data: cities } = await supabase.from("client_cities").select("*").eq("client_id", client_id);
    const cityName = cities?.[0]?.city_name ?? "Unknown";

    // Get keywords with rank history (last 60 days)
    const { data: keywords } = await supabase.from("keywords").select("*").eq("client_id", client_id);
    if (!keywords?.length) throw new Error("No keywords");

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const keywordIds = keywords.map((k: any) => k.id);
    const { data: history } = await supabase
      .from("rank_history")
      .select("*")
      .in("keyword_id", keywordIds)
      .gte("checked_at", sixtyDaysAgo)
      .order("checked_at", { ascending: true });

    // Get search volumes
    const { data: volumes } = await supabase
      .from("keyword_search_volume")
      .select("*")
      .in("keyword_id", keywordIds);
    const volumeMap = new Map<string, number>();
    for (const v of volumes ?? []) {
      const existing = volumeMap.get(v.keyword_id);
      if (!existing || v.search_volume > existing) {
        volumeMap.set(v.keyword_id, v.search_volume ?? 0);
      }
    }

    // Get GSC data
    const { data: gscRaw } = await supabase
      .from("gsc_query_data")
      .select("*")
      .eq("client_id", client_id);

    // Aggregate GSC by query
    const gscAgg = new Map<string, { query: string; impressions: number; clicks: number; positionSum: number; count: number }>();
    for (const row of gscRaw ?? []) {
      const key = row.query.toLowerCase();
      const existing = gscAgg.get(key);
      if (existing) {
        existing.impressions += row.impressions ?? 0;
        existing.clicks += row.clicks ?? 0;
        existing.positionSum += Number(row.position ?? 0);
        existing.count++;
      } else {
        gscAgg.set(key, {
          query: row.query,
          impressions: row.impressions ?? 0,
          clicks: row.clicks ?? 0,
          positionSum: Number(row.position ?? 0),
          count: 1,
        });
      }
    }
    const gscSorted = Array.from(gscAgg.values())
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 50);

    const trackedKeywords = new Set(keywords.map((k: any) => k.keyword.toLowerCase()));
    const gscLines = gscSorted.map((g) => {
      const avgPos = Math.round(g.positionSum / g.count);
      const ctr = g.impressions > 0 ? ((g.clicks / g.impressions) * 100).toFixed(1) : "0.0";
      const tracked = trackedKeywords.has(g.query.toLowerCase()) ? " [TRACKED]" : " [NOT TRACKED]";
      return `"${g.query}" | pos ${avgPos} | ${g.impressions.toLocaleString()} impr | ${g.clicks.toLocaleString()} clicks | ${ctr}% CTR${tracked}`;
    });

    // Analyze each keyword
    const kwAnalysis: string[] = [];
    const quickWins: string[] = [];
    const declining: string[] = [];

    // Group by status
    const statusGroups: Record<string, string[]> = {};

    for (const kw of keywords) {
      const kwHistory = (history ?? []).filter((h: any) => h.keyword_id === kw.id);
      const today = kwHistory[kwHistory.length - 1]?.position ?? null;
      const thirtyDaysAgoRecord = kwHistory.find((h: any) => {
        const d = new Date(h.checked_at);
        return d <= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      });
      const monthAgo = thirtyDaysAgoRecord?.position ?? kwHistory[0]?.position ?? null;

      let trend = "stable";
      if (today !== null && monthAgo !== null) {
        if (today < monthAgo) trend = "improving";
        else if (today > monthAgo) trend = "declining";
      }

      const changeText = today !== null && monthAgo !== null
        ? `(${trend === "improving" ? "up" : trend === "declining" ? "down" : "unchanged"} ${Math.abs((monthAgo ?? 0) - (today ?? 0))} spots vs last month)`
        : "(no historical data)";

      const vol = volumeMap.get(kw.id);
      const volText = vol ? ` · ${vol.toLocaleString()} searches/mo` : "";

      kwAnalysis.push(`"${kw.keyword}" — position #${today ?? "not ranked"} today ${changeText}${volText}`);

      if (today !== null && today >= 11 && today <= 20) quickWins.push(`"${kw.keyword}" at #${today}`);
      if (trend === "declining") declining.push(`"${kw.keyword}" dropped from #${monthAgo} to #${today}`);

      const status = kw.status || "monitoring";
      if (!statusGroups[status]) statusGroups[status] = [];
      statusGroups[status].push(kw.keyword);
    }

    // Get competitors
    const { data: competitors } = await supabase.from("competitors").select("domain").eq("client_id", client_id).eq("is_tracked", true);
    const compDomains = (competitors ?? []).map((c: any) => c.domain);

    // Build status section
    const statusLines = Object.entries(statusGroups)
      .map(([status, kws]) => `${status.toUpperCase()}: ${kws.map(k => `"${k}"`).join(", ")}`)
      .join("\n");

    // Build prompt
    const prompt = `You are an SEO advisor writing a monthly update for a local business owner. Analyse ALL the data below and provide exactly 5 specific, actionable recommendations ranked by potential impact.

RULES:
- Write in warm, plain language a business owner understands — no SEO jargon whatsoever
- Be specific to this client's actual data, not generic advice
- Focus on what they SHOULD DO, not what the problem is
- Never use terms like: SERP, CTR, schema, canonical, crawl, indexation, domain authority, backlinks
- Do say: Google search results, your website page, your listing, show up higher, appear on Google
- Factor in Google Search Console impressions and click-through rates when making suggestions
- Identify high-impression low-CTR queries as content optimization opportunities (people see the listing but don't click — the page title or description needs improving)
- Suggest new keywords to track based on GSC queries that are marked [NOT TRACKED] but have high impressions
- Compare tracked keywords vs GSC queries to find gaps worth tracking
- Prioritise keywords with status "optimizing" — the client is actively working on these

CLIENT: ${client.name} · ${client.domain} · ${cityName}

KEYWORD RANKINGS (today vs 30 days ago, with monthly search volume where available):
${kwAnalysis.join("\n")}

KEYWORD STATUSES:
${statusLines}

QUICK-WIN OPPORTUNITIES (positions 11–20, just one page off Google's first page):
${quickWins.length > 0 ? quickWins.join("\n") : "None currently"}

KEYWORDS LOSING GROUND:
${declining.length > 0 ? declining.join("\n") : "None"}

GOOGLE SEARCH CONSOLE DATA (top 50 by impressions):
${gscLines.length > 0 ? gscLines.join("\n") : "No GSC data available"}

COMPETITOR DOMAINS BEING TRACKED:
${compDomains.length > 0 ? compDomains.join("\n") : "None"}

Respond ONLY with valid JSON, no markdown fences:
{
  "suggestions": [
    { "rank": 1, "title": "Short title max 8 words", "description": "2-3 plain English sentences on what to do and why.", "impact": "high", "effort": "low", "keywords_affected": ["keyword1"] },
    { "rank": 2, "title": "...", "description": "...", "impact": "high", "effort": "medium", "keywords_affected": [] },
    { "rank": 3, "title": "...", "description": "...", "impact": "high", "effort": "low", "keywords_affected": [] },
    { "rank": 4, "title": "...", "description": "...", "impact": "medium", "effort": "medium", "keywords_affected": [] },
    { "rank": 5, "title": "...", "description": "...", "impact": "medium", "effort": "low", "keywords_affected": [] }
  ]
}`;

    // Call Anthropic
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const anthropicData = await anthropicRes.json();
    const responseText = anthropicData.content?.[0]?.text ?? "";

    // Parse JSON
    let suggestions;
    try {
      suggestions = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      suggestions = match ? JSON.parse(match[0]) : { suggestions: [] };
    }

    // Log AI cost
    await supabase.from("api_usage_log").insert({
      client_id,
      function_name: "generate-suggestions",
      api_provider: "anthropic",
      endpoint: "v1/messages",
      task_count: 1,
      cost_usd: 0.006,
    });

    // Upsert into seo_suggestions
    await supabase.from("seo_suggestions").insert({
      client_id,
      suggestions,
      generated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify(suggestions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-suggestions error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
