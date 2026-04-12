import { corsHeaders } from "@supabase/supabase-js/cors";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { domain, client_name, city_name } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are an SEO keyword research expert. Given a business domain, name, and target city, suggest exactly 20 high-value SEO keywords that the business should track. Focus on local SEO keywords, service-based keywords, and high-intent search terms. Return keywords using the provided tool.",
          },
          {
            role: "user",
            content: `Business: ${client_name}\nDomain: ${domain}\nTarget City: ${city_name}\n\nSuggest 20 SEO keywords this business should track.`,
          },
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
