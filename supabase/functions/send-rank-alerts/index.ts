import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_EMAIL = "fecreationsllc@gmail.com";
const DROP_THRESHOLD = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const clientId = body.client_id;

    // Get clients to check
    let clientsQuery = sb.from("clients").select("*");
    if (clientId) clientsQuery = clientsQuery.eq("id", clientId);
    const { data: clients, error: clientsErr } = await clientsQuery;
    if (clientsErr) throw clientsErr;
    if (!clients?.length) return new Response(JSON.stringify({ message: "No clients" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let totalAlerts = 0;

    for (const client of clients) {
      const { data: keywords } = await sb.from("keywords").select("id, keyword").eq("client_id", client.id);
      if (!keywords?.length) continue;

      const { data: cities } = await sb.from("client_cities").select("id, city_name").eq("client_id", client.id);
      if (!cities?.length) continue;

      const drops: { keyword: string; city: string; oldPos: number; newPos: number }[] = [];

      for (const kw of keywords) {
        for (const city of cities) {
          const { data: history } = await sb
            .from("rank_history")
            .select("position, checked_at")
            .eq("keyword_id", kw.id)
            .eq("city_id", city.id)
            .order("checked_at", { ascending: false })
            .limit(2);

          if (!history || history.length < 2) continue;
          const [latest, previous] = history;
          if (latest.position === null || previous.position === null) continue;

          const drop = latest.position - previous.position;
          if (drop >= DROP_THRESHOLD) {
            drops.push({
              keyword: kw.keyword,
              city: city.city_name,
              oldPos: previous.position,
              newPos: latest.position,
            });
          }
        }
      }

      if (drops.length === 0) continue;

      const recipientEmail = client.alert_email || DEFAULT_EMAIL;

      const dropRows = drops
        .map(d => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${d.keyword}</td><td style="padding:8px;border-bottom:1px solid #eee">${d.city}</td><td style="padding:8px;border-bottom:1px solid #eee">${d.oldPos} → ${d.newPos} (↓${d.newPos - d.oldPos})</td></tr>`)
        .join("");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#ef4444">⚠️ Rank Drop Alert: ${client.name}</h2>
          <p>${drops.length} keyword${drops.length > 1 ? "s" : ""} dropped ${DROP_THRESHOLD}+ positions for <strong>${client.domain}</strong>:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <thead><tr style="background:#f9fafb"><th style="padding:8px;text-align:left">Keyword</th><th style="padding:8px;text-align:left">City</th><th style="padding:8px;text-align:left">Change</th></tr></thead>
            <tbody>${dropRows}</tbody>
          </table>
          <p style="color:#6b7280;font-size:13px">— RankRadar</p>
        </div>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "RankRadar <onboarding@resend.dev>",
          to: [recipientEmail],
          subject: `⚠️ Rank drops detected for ${client.name}`,
          html,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Resend error for ${client.name}: ${errText}`);
      } else {
        totalAlerts += drops.length;
        // Log cost
        await sb.from("api_usage_log").insert({
          api_provider: "resend",
          function_name: "send-rank-alerts",
          client_id: client.id,
          cost_usd: 0,
          endpoint: "/emails",
          task_count: 1,
        });
      }
    }

    return new Response(JSON.stringify({ alerts_sent: totalAlerts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-rank-alerts error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
