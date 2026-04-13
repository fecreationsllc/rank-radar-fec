import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id is required");

    // Get client
    const { data: client } = await supabase.from("clients").select("*").eq("id", client_id).single();
    if (!client) throw new Error("Client not found");
    if (!client.alert_email) throw new Error("No alert email configured for this client. Set one in Settings first.");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    // Build sample alert data using real keywords if available
    const { data: keywords } = await supabase
      .from("keywords")
      .select("keyword")
      .eq("client_id", client_id)
      .limit(3);

    const sampleAlerts = (keywords && keywords.length > 0)
      ? keywords.map((kw, i) => ({
          keyword: kw.keyword,
          old_pos: 5 + i * 3,
          new_pos: 18 + i * 7,
        }))
      : [
          { keyword: "example keyword 1", old_pos: 3, new_pos: 15 },
          { keyword: "example keyword 2", old_pos: 7, new_pos: 22 },
        ];

    const body = sampleAlerts
      .map((a) => `• "${a.keyword}" dropped from #${a.old_pos} to #${a.new_pos}`)
      .join("\n");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("ALERT_FROM_EMAIL") ?? "alerts@rankradar.app",
        to: [client.alert_email],
        subject: `[TEST] Rank drop alert — ${client.name}`,
        text: `⚠️ This is a TEST alert — no real rank drops occurred.\n\nSample ranking drops for ${client.name}:\n\n${body}\n\n---\nThis test was triggered manually from the RankRadar dashboard.`,
      }),
    });

    const emailData = await emailRes.json();

    if (!emailRes.ok) {
      console.error("Resend error:", emailData);
      throw new Error(`Email send failed: ${emailData.message ?? emailRes.statusText}`);
    }

    return new Response(JSON.stringify({ success: true, sent_to: client.alert_email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-test-alert error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
