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
    const keywordIds = keywords.map((k) => k.id);
    const { data: history } = await supabase
      .from("rank_history")
      .select("*")
      .in("keyword_id", keywordIds)
      .gte("checked_at", sixtyDaysAgo)
      .order("checked_at", { ascending: true });

    // Analyze each keyword
    const kwAnalysis: string[] = [];
    const quickWins: string[] = [];
    const declining: string[] = [];

    for (const kw of keywords) {
      const kwHistory = (history ?? []).filter((h) => h.keyword_id === kw.id);
      const today = kwHistory[kwHistory.length - 1]?.position ?? null;
      const thirtyDaysAgoRecord = kwHistory.find((h) => {
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

      kwAnalysis.push(`"${kw.keyword}" — position #${today ?? "not ranked"} today ${changeText}`);

      if (today !== null && today >= 11 && today <= 20) quickWins.push(`"${kw.keyword}" at #${today}`);
      if (trend === "declining") declining.push(`"${kw.keyword}" dropped from #${monthAgo} to #${today}`);
    }

    // Get competitors
    const { data: competitors } = await supabase.from("competitors").select("domain").eq("client_id", client_id).eq("is_tracked", true);
    const compDomains = (competitors ?? []).map((c) => c.domain);

    // Build prompt
    const prompt = `You are an SEO advisor writing a monthly update for a local business owner. Analyse the keyword ranking data below and provide exactly 3 specific, actionable recommendations ranked by potential impact.

RULES:
- Write in warm, plain language a business owner understands — no SEO jargon whatsoever
- Be specific to this client's actual data, not generic advice
- Focus on what they SHOULD DO, not what the problem is
- Never use terms like: SERP, CTR, schema, canonical, crawl, indexation, domain authority, backlinks
- Do say: Google search results, your website page, your listing, show up higher, appear on Google

CLIENT: ${client.name} · ${client.domain} · ${cityName}

KEYWORD RANKINGS (today vs 30 days ago):
${kwAnalysis.join("\n")}

QUICK-WIN OPPORTUNITIES (positions 11–20, just one page off Google's first page):
${quickWins.length > 0 ? quickWins.join("\n") : "None currently"}

KEYWORDS LOSING GROUND:
${declining.length > 0 ? declining.join("\n") : "None"}

COMPETITOR DOMAINS BEING TRACKED:
${compDomains.length > 0 ? compDomains.join("\n") : "None"}

Respond ONLY with valid JSON, no markdown fences:
{
  "suggestions": [
    { "rank": 1, "title": "Short title max 8 words", "description": "2-3 plain English sentences on what to do and why.", "impact": "high", "effort": "low", "keywords_affected": ["keyword1"] },
    { "rank": 2, "title": "...", "description": "...", "impact": "high", "effort": "medium", "keywords_affected": [] },
    { "rank": 3, "title": "...", "description": "...", "impact": "medium", "effort": "low", "keywords_affected": [] }
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
        max_tokens: 1000,
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
      // Try extracting JSON from response
      const match = responseText.match(/\{[\s\S]*\}/);
      suggestions = match ? JSON.parse(match[0]) : { suggestions: [] };
    }

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
