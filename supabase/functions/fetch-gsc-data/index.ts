import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function refreshToken(sb: any, connection: any, table: string, matchColumn: string, matchValue: string): Promise<string> {
  if (new Date(connection.token_expires_at) > new Date(Date.now() + 60000)) {
    return connection.access_token;
  }

  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error("Failed to refresh Google token");
  const tokens = await res.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

  await sb.from(table).update({
    access_token: tokens.access_token,
    token_expires_at: expiresAt,
  }).eq(matchColumn, matchValue);

  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id is required");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Try client-specific connection first, fall back to global
    let connection: any = null;
    let tokenTable = "";
    let tokenMatchCol = "";
    let tokenMatchVal = "";

    const { data: clientConn } = await sb.from("client_gsc_connections").select("*").eq("client_id", client_id).single();
    if (clientConn) {
      connection = clientConn;
      tokenTable = "client_gsc_connections";
      tokenMatchCol = "client_id";
      tokenMatchVal = client_id;
      console.log("Using client-specific GSC connection");
    } else {
      const { data: globalConn } = await sb.from("gsc_connections").select("*").limit(1).single();
      if (globalConn) {
        connection = globalConn;
        tokenTable = "gsc_connections";
        tokenMatchCol = "id";
        tokenMatchVal = globalConn.id;
        console.log("Using global GSC connection");
      }
    }

    if (!connection) throw new Error("Google Search Console not connected");

    // Get client domain
    const { data: client } = await sb.from("clients").select("domain").eq("id", client_id).single();
    if (!client) throw new Error("Client not found");

    const accessToken = await refreshToken(sb, connection, tokenTable, tokenMatchCol, tokenMatchVal);
    const cleanDomain = client.domain.replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/+$/, "");

    // Try both sc-domain and URL prefix formats
    const siteUrls = [
      `sc-domain:${cleanDomain}`,
      `https://${cleanDomain}/`,
      `https://www.${cleanDomain}/`,
      `http://${cleanDomain}/`,
    ];

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);

    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    let rows: any[] = [];
    let usedSiteUrl = "";

    for (const siteUrl of siteUrls) {
      const gscRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startDate: formatDate(startDate),
            endDate: formatDate(endDate),
            dimensions: ["query", "date"],
            rowLimit: 500,
          }),
        }
      );

      if (gscRes.ok) {
        const data = await gscRes.json();
        rows = data.rows ?? [];
        usedSiteUrl = siteUrl;
        break;
      }
    }

    if (!usedSiteUrl) {
      return new Response(JSON.stringify({ error: "Could not find this domain in Google Search Console. Make sure the property is verified.", queries: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete old data for this client
    await sb.from("gsc_query_data").delete().eq("client_id", client_id);

    // Insert new data
    if (rows.length > 0) {
      const inserts = rows.map((row: any) => ({
        client_id,
        query: row.keys[0],
        date: row.keys[1],
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: Math.round((row.ctr ?? 0) * 10000) / 10000,
        position: Math.round((row.position ?? 0) * 100) / 100,
      }));

      // Insert in batches of 200
      for (let i = 0; i < inserts.length; i += 200) {
        await sb.from("gsc_query_data").insert(inserts.slice(i, i + 200));
      }
    }

    // Log cost (GSC API is free)
    await sb.from("api_usage_log").insert({
      client_id,
      function_name: "fetch-gsc-data",
      api_provider: "google",
      endpoint: "searchAnalytics/query",
      task_count: 1,
      cost_usd: 0,
    });

    return new Response(JSON.stringify({ success: true, queries: rows.length, site_url: usedSiteUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-gsc-data error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
