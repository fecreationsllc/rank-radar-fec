import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
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
  return dominated.slice(0, 5);
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

    // Fetch client info
    const { data: client } = await sb.from("clients").select("*").eq("id", client_id).single();
    if (!client) throw new Error("Client not found");

    // Fetch existing keywords
    const { data: existingKws } = await sb.from("keywords").select("keyword").eq("client_id", client_id);
    const existingList = (existingKws ?? []).map(k => k.keyword.toLowerCase());

    // Fetch primary city
    const { data: cities } = await sb.from("client_cities").select("city_name").eq("client_id", client_id).eq("is_primary", true).limit(1);
    const cityName = cities?.[0]?.city_name ?? "";

    // Scrape website
    let websiteContent = "";
    const cleanDomain = client.domain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
    const homepageUrl = `https://${cleanDomain}`;
    const homepageHtml = await fetchPageHtml(homepageUrl);

    if (homepageHtml) {
      websiteContent += `[Homepage]: ${stripHtml(homepageHtml).slice(0, 2000)}\n\n`;
      const links = extractLinks(homepageHtml, cleanDomain);
      const subpages = prioritizeLinks(links, homepageUrl);
      const subResults = await Promise.all(
        subpages.map(async (url) => {
          const html = await fetchPageHtml(url);
          if (!html) return null;
          return `[${new URL(url).pathname}]: ${stripHtml(html).slice(0, 2000)}`;
        })
      );
      for (const r of subResults) if (r) websiteContent += r + "\n\n";
      if (websiteContent.length > 10000) websiteContent = websiteContent.slice(0, 10000);
    }

    const hasContent = websiteContent.length > 100;

    const systemPrompt = "You are an SEO keyword research expert. Given a business's existing tracked keywords, analyze gaps in their keyword strategy and suggest 15 additional high-value keywords they should add. Focus on: long-tail variations they're missing, related services not yet covered, local intent keywords, and high-intent commercial terms. Do NOT suggest keywords they already track. Return keywords using the provided tool.";

    let userContent = `Business: ${client.name}\nDomain: ${client.domain}\nTarget City: ${cityName}\n\nCurrently tracked keywords:\n${existingList.join(", ")}\n\n`;
    if (hasContent) {
      userContent += `--- WEBSITE CONTENT ---\n${websiteContent}---\n\nBased on the website content and the gaps in their current keyword list, suggest 15 additional keywords.`;
    } else {
      userContent += `Suggest 15 additional keywords that complement their current list.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
            name: "suggest_keywords",
            description: "Return exactly 15 additional SEO keywords the business should track.",
            parameters: {
              type: "object",
              properties: {
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of 15 SEO keywords",
                },
              },
              required: ["keywords"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_keywords" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const parsed = JSON.parse(toolCall.function.arguments);
    // Filter out any that already exist
    const filtered = (parsed.keywords as string[]).filter(
      kw => !existingList.includes(kw.toLowerCase())
    );

    return new Response(JSON.stringify({ keywords: filtered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-more-keywords error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
