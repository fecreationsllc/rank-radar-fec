const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    if (href.startsWith("/")) {
      href = `https://${domain}${href}`;
    }
    try {
      const u = new URL(href);
      if (u.hostname === domain || u.hostname === `www.${domain}` || `www.${u.hostname}` === domain) {
        links.add(u.origin + u.pathname);
      }
    } catch { /* skip invalid */ }
  }
  return Array.from(links);
}

function prioritizeLinks(links: string[], homepageUrl: string): string[] {
  const dominated = links.filter(l => l !== homepageUrl && l !== homepageUrl + "/");
  const priority = ["service", "about", "what-we-do", "solutions", "offering", "product", "work", "portfolio", "residential", "commercial", "contact"];
  dominated.sort((a, b) => {
    const aScore = priority.findIndex(p => a.toLowerCase().includes(p));
    const bScore = priority.findIndex(p => b.toLowerCase().includes(p));
    const aVal = aScore === -1 ? 999 : aScore;
    const bVal = bScore === -1 ? 999 : bScore;
    return aVal - bVal;
  });
  return dominated.slice(0, 5);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { domain, client_name, city_name } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Scrape website content
    let websiteContent = "";
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");
    const homepageUrl = `https://${cleanDomain}`;
    const homepageHtml = await fetchPageHtml(homepageUrl);

    if (homepageHtml) {
      const homepageText = stripHtml(homepageHtml).slice(0, 2000);
      websiteContent += `[Homepage]: ${homepageText}\n\n`;

      const links = extractLinks(homepageHtml, cleanDomain);
      const subpages = prioritizeLinks(links, homepageUrl);

      const subResults = await Promise.all(
        subpages.map(async (url) => {
          const html = await fetchPageHtml(url);
          if (!html) return null;
          const path = new URL(url).pathname;
          const text = stripHtml(html).slice(0, 2000);
          return `[${path}]: ${text}`;
        })
      );

      for (const r of subResults) {
        if (r) websiteContent += r + "\n\n";
      }

      // Cap total content
      if (websiteContent.length > 10000) {
        websiteContent = websiteContent.slice(0, 10000);
      }
    }

    const hasContent = websiteContent.length > 100;

    const systemPrompt = hasContent
      ? "You are an SEO keyword research expert. Analyze the provided website content and suggest exactly 20 high-value SEO keywords. Include long-tail keywords based on specific services and offerings found on the site. Focus on local SEO keywords, service-based keywords, and high-intent search terms relevant to the target city. Return keywords using the provided tool."
      : "You are an SEO keyword research expert. Given a business domain, name, and target city, suggest exactly 20 high-value SEO keywords that the business should track. Focus on local SEO keywords, service-based keywords, and high-intent search terms. Return keywords using the provided tool.";

    let userContent = `Business: ${client_name}\nDomain: ${domain}\nTarget City: ${city_name}\n\n`;
    if (hasContent) {
      userContent += `--- WEBSITE CONTENT ---\n${websiteContent}---\n\nBased on the actual services and content above, suggest 20 SEO keywords this business should track.`;
    } else {
      userContent += `Suggest 20 SEO keywords this business should track.`;
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
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_keywords",
              description: "Return exactly 20 SEO keywords for the business.",
              parameters: {
                type: "object",
                properties: {
                  keywords: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of 20 SEO keywords",
                  },
                },
                required: ["keywords"],
                additionalProperties: false,
              },
            },
          },
        ],
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
    return new Response(JSON.stringify({ keywords: parsed.keywords }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-keywords error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
