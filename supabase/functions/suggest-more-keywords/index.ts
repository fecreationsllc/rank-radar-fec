import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VOLUME_THRESHOLD_NORMAL = 50;
const VOLUME_THRESHOLD_LOW = 10;
const MIN_RESULTS_BEFORE_FALLBACK = 5;

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RankRadarBot/1.0)" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html: string, domain: string): string[] {
  const linkRegex = /href=["']([^"']+)["']/gi;
  const links = new Set<string>();
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    if (/\.(jpg|jpeg|png|gif|svg|css|js|ico|pdf|zip|mp4|webp|woff|ttf)$/i.test(href)) continue;
    if (href.startsWith("/")) href = `https://${domain}${href}`;
    try {
      const u = new URL(href);
      if (u.hostname === domain || u.hostname === `www.${domain}` || `www.${u.hostname}` === domain) {
        links.add(u.origin + u.pathname);
      }
    } catch { /* skip */ }
  }
  return Array.from(links);
}

function prioritizeLinks(links: string[], homepageUrl: string): string[] {
  const dominated = links.filter(l => l !== homepageUrl && l !== homepageUrl + "/");
  const priority = ["service", "about", "what-we-do", "solutions", "offering", "product", "work", "portfolio", "residential", "commercial", "contact"];
  dominated.sort((a, b) => {
    const aScore = priority.findIndex(p => a.toLowerCase().includes(p));
    const bScore = priority.findIndex(p => b.toLowerCase().includes(p));
    return (aScore === -1 ? 999 : aScore) - (bScore === -1 ? 999 : bScore);
  });
  return dominated.slice(0, 2);
}

async function fetchSearchVolumes(
  keywords: string[],
  locationCode: number,
  dfAuth: string
): Promise<Map<string, number>> {
  const volumeMap = new Map<string, number>();
  if (keywords.length === 0) return volumeMap;

  try {
    const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
      method: "POST",
      headers: { Authorization: dfAuth, "Content-Type": "application/json" },
      body: JSON.stringify([{
        keywords,
        location_code: locationCode,
        language_code: "en",
      }]),
    });

    if (!res.ok) {
      console.error("DataForSEO volume API error:", res.status, await res.text());
      return volumeMap;
    }

    const data = await res.json();
    const results = data.tasks?.[0]?.result ?? [];
    for (const r of results) {
      if (r.keyword && r.search_volume != null && r.search_volume > 0) {
        volumeMap.set(r.keyword.toLowerCase(), r.search_volume);
      }
    }
  } catch (e) {
    console.error("DataForSEO volume fetch error:", e);
  }

  return volumeMap;
}

async function callAiForKeywords(
  systemPrompt: string,
  userContent: string,
  toolName: string,
  toolDescription: string,
  apiKey: string,
): Promise<string[]> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [{
        type: "function",
        function: {
          name: toolName,
          description: toolDescription,
          parameters: {
            type: "object",
            properties: {
              keywords: {
                type: "array",
                items: { type: "string" },
                description: "Array of SEO keywords",
              },
            },
            required: ["keywords"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text();
    console.error(`AI gateway error (${toolName}):`, status, text);
    const err = new Error(`AI gateway returned ${status}`);
    (err as any).status = status;
    throw err;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error(`No tool call in response (${toolName})`);
  const parsed = JSON.parse(toolCall.function.arguments);
  return (parsed.keywords as string[]) ?? [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN")!;
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD")!;
    const dfAuth = "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Fetch client info
    const { data: client } = await sb.from("clients").select("*").eq("id", client_id).single();
    if (!client) throw new Error("Client not found");

    // Fetch existing keywords
    const { data: existingKws } = await sb.from("keywords").select("keyword").eq("client_id", client_id);
    const existingList = (existingKws ?? []).map(k => k.keyword.toLowerCase());

    // Fetch primary city
    const { data: cities } = await sb.from("client_cities").select("*").eq("client_id", client_id).eq("is_primary", true).limit(1);
    const primaryCity = cities?.[0];
    const cityName = primaryCity?.city_name ?? "";
    const locationCode = primaryCity?.location_code ?? 1023191;

    const businessType: string = (client as any).category ?? "";

    // Fetch GSC queries not yet tracked (for AI context)
    let gscContext = "";
    const { data: gscRows } = await sb
      .from("gsc_query_data")
      .select("query, clicks, impressions")
      .eq("client_id", client_id)
      .order("impressions", { ascending: false })
      .limit(50);
    if (gscRows && gscRows.length > 0) {
      const untrackedGsc = gscRows.filter(r => !existingList.includes(r.query.toLowerCase()));
      if (untrackedGsc.length > 0) {
        gscContext = `\n\n--- GOOGLE SEARCH CONSOLE DATA (untracked queries users are finding this site with) ---\n`;
        gscContext += untrackedGsc.slice(0, 30).map(r => `"${r.query}" (${r.clicks} clicks, ${r.impressions} impressions)`).join("\n");
        gscContext += `\n---\nThese are real queries from Google Search Console that the business is NOT yet tracking. Prioritize suggesting keywords related to these real queries.`;
      }
    }

    // ============ PASS A: WEBSITE-DERIVED IDEAS ============
    let websiteContent = "";
    const cleanDomain = client.domain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
    const homepageUrl = `https://${cleanDomain}`;
    const homepageHtml = await fetchPageHtml(homepageUrl);

    if (homepageHtml) {
      websiteContent += `[Homepage]: ${stripHtml(homepageHtml).slice(0, 1000)}\n\n`;
      const links = extractLinks(homepageHtml, cleanDomain);
      const subpages = prioritizeLinks(links, homepageUrl);
      const subResults = await Promise.all(
        subpages.map(async (url) => {
          const html = await fetchPageHtml(url);
          if (!html) return null;
          return `[${new URL(url).pathname}]: ${stripHtml(html).slice(0, 1000)}`;
        })
      );
      for (const r of subResults) if (r) websiteContent += r + "\n\n";
      if (websiteContent.length > 5000) websiteContent = websiteContent.slice(0, 5000);
    }

    const hasContent = websiteContent.length > 100;

    const websiteSystemPrompt = "You are an SEO keyword research expert. Given a business's existing tracked keywords, analyze gaps in their keyword strategy and suggest 25 additional high-value keywords they should add. Focus on: long-tail variations they're missing, related services not yet covered, local intent keywords, and high-intent commercial terms. If Google Search Console data is provided, strongly prioritize keywords related to real queries users are already using to find the site. Do NOT suggest keywords they already track. Return keywords using the provided tool.";

    let websiteUserContent = `Business: ${client.name}\nDomain: ${client.domain}\nTarget City: ${cityName}\n\nCurrently tracked keywords:\n${existingList.join(", ")}\n\n`;
    if (hasContent) {
      websiteUserContent += `--- WEBSITE CONTENT ---\n${websiteContent}---\n\n`;
    }
    websiteUserContent += gscContext;
    websiteUserContent += hasContent
      ? `\n\nBased on the website content${gscContext ? ", real GSC queries," : ""} and the gaps in their current keyword list, suggest 25 additional keywords (we will filter by search volume afterward).`
      : `\nSuggest 25 additional keywords that complement their current list.`;

    let websiteIdeas: string[] = [];
    try {
      websiteIdeas = await callAiForKeywords(
        websiteSystemPrompt,
        websiteUserContent,
        "suggest_keywords",
        "Return exactly 25 additional SEO keywords the business should track.",
        LOVABLE_API_KEY,
      );
    } catch (e: any) {
      if (e.status === 429 || e.status === 402) {
        return new Response(JSON.stringify({ error: e.status === 429 ? "Rate limited, please try again later." : "Payment required." }), {
          status: e.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
    console.log(`[suggest-more-keywords] Pass A (website) returned ${websiteIdeas.length} ideas`);

    // ============ PASS B: CATEGORY + CITY IDEAS ============
    let categoryCityIdeas: string[] = [];
    if (businessType && cityName) {
      const categoryCityPrompt = `Generate 40 keyword ideas for a ${businessType} in ${cityName}. Include variations of: service + city, service + neighborhood names, service + near me, specific service types + city, common customer questions.`;
      try {
        categoryCityIdeas = await callAiForKeywords(
          "You are an SEO keyword research expert specializing in local service businesses. Return only the keyword phrases via the provided tool.",
          categoryCityPrompt,
          "suggest_keywords",
          "Return 40 local-intent SEO keyword ideas for the given business type and city.",
          LOVABLE_API_KEY,
        );
      } catch (e: any) {
        // Don't fail the whole call if just this pass errors — log and continue.
        console.error("[suggest-more-keywords] Pass B (category+city) failed:", e.message);
      }
      console.log(`[suggest-more-keywords] Pass B (category="${businessType}", city="${cityName}") returned ${categoryCityIdeas.length} ideas`);
    } else {
      console.log(`[suggest-more-keywords] Pass B skipped — missing ${!businessType ? "category" : ""}${!businessType && !cityName ? " and " : ""}${!cityName ? "city" : ""}`);
    }

    // ============ MERGE + DEDUPE (case-insensitive, exclude already-tracked) ============
    const seen = new Set<string>(existingList);
    const merged: string[] = [];
    for (const kw of [...websiteIdeas, ...categoryCityIdeas]) {
      const trimmed = kw.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      merged.push(trimmed);
    }
    console.log(`[suggest-more-keywords] Merged unique ideas after dedupe: ${merged.length}`);

    // ============ VOLUME LOOKUP ============
    const volumeMap = await fetchSearchVolumes(merged, locationCode, dfAuth);

    const allWithVolume = merged
      .map((kw) => ({ keyword: kw, volume: volumeMap.get(kw.toLowerCase()) ?? 0 }))
      .sort((a, b) => b.volume - a.volume);

    const normalPass = allWithVolume.filter((k) => k.volume >= VOLUME_THRESHOLD_NORMAL);
    console.log(`[suggest-more-keywords] Passed normal threshold (>=${VOLUME_THRESHOLD_NORMAL}): ${normalPass.length}`);

    let resultKeywords: { keyword: string; volume: number; isLowVolume: boolean }[] = normalPass.map((k) => ({
      ...k,
      isLowVolume: false,
    }));

    if (resultKeywords.length < MIN_RESULTS_BEFORE_FALLBACK) {
      const lowPass = allWithVolume.filter(
        (k) => k.volume >= VOLUME_THRESHOLD_LOW && k.volume < VOLUME_THRESHOLD_NORMAL,
      );
      console.log(`[suggest-more-keywords] Fallback engaged. Adding low-volume (>=${VOLUME_THRESHOLD_LOW} & <${VOLUME_THRESHOLD_NORMAL}): ${lowPass.length}`);
      resultKeywords = [
        ...resultKeywords,
        ...lowPass.map((k) => ({ ...k, isLowVolume: true })),
      ];
    }

    console.log(`[suggest-more-keywords] Final result count: ${resultKeywords.length}`);

    // Log API usage
    const usageRows: any[] = [
      {
        client_id,
        function_name: "suggest-more-keywords",
        api_provider: "lovable_ai",
        endpoint: "v1/chat/completions",
        task_count: 1 + (categoryCityIdeas.length > 0 ? 1 : 0),
        cost_usd: 0.001 * (1 + (categoryCityIdeas.length > 0 ? 1 : 0)),
      },
      {
        client_id,
        function_name: "suggest-more-keywords",
        api_provider: "dataforseo",
        endpoint: "keywords_data/google_ads/search_volume/live",
        task_count: 1,
        cost_usd: 0.05,
      },
    ];
    await sb.from("api_usage_log").insert(usageRows);

    return new Response(JSON.stringify({ keywords: resultKeywords }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-more-keywords error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
