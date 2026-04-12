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

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const clientId = body.client_id;

    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN")!;
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const dfAuth = "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Get keywords and cities
    let keywordsQuery = supabase.from("keywords").select("*, clients(*)");
    if (clientId) keywordsQuery = keywordsQuery.eq("client_id", clientId);
    const { data: keywords } = await keywordsQuery;
    if (!keywords?.length) return new Response(JSON.stringify({ message: "No keywords" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Get cities for each client
    const clientIds = [...new Set(keywords.map((k: any) => k.client_id))];
    const { data: cities } = await supabase.from("client_cities").select("*").in("client_id", clientIds);

    // Build tasks - one per keyword+city pair
    const tasks: any[] = [];
    const taskMeta: { keyword_id: string; city_id: string; client_domain: string; client_id: string }[] = [];

    for (const kw of keywords as any[]) {
      const kwCities = (cities ?? []).filter((c: any) => c.client_id === kw.client_id);
      for (const city of kwCities) {
        tasks.push({
          keyword: kw.keyword,
          location_code: city.location_code,
          language_code: "en",
          device: "desktop",
          depth: 100,
        });
        taskMeta.push({
          keyword_id: kw.id,
          city_id: city.id,
          client_domain: kw.clients?.domain ?? "",
          client_id: kw.client_id,
        });
      }
    }

    if (tasks.length === 0) {
      return new Response(JSON.stringify({ message: "No tasks to process" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Post tasks to DataForSEO (batch)
    const postRes = await fetch("https://api.dataforseo.com/v3/serp/google/organic/task_post", {
      method: "POST",
      headers: { Authorization: dfAuth, "Content-Type": "application/json" },
      body: JSON.stringify(tasks),
    });
    const postData = await postRes.json();

    if (postData.status_code !== 20000) {
      throw new Error(`DataForSEO task_post failed: ${JSON.stringify(postData)}`);
    }

    // Map task IDs to our metadata
    const taskIds: { id: string; meta: typeof taskMeta[0] }[] = [];
    for (let i = 0; i < (postData.tasks?.length ?? 0); i++) {
      const task = postData.tasks[i];
      if (task?.id) {
        taskIds.push({ id: task.id, meta: taskMeta[i] });
      }
    }

    // Wait for tasks to process
    await new Promise((r) => setTimeout(r, 60000));

    // Fetch results
    const rankInserts: any[] = [];
    const alerts: { client_id: string; keyword: string; old_pos: number; new_pos: number }[] = [];

    for (const { id, meta } of taskIds) {
      try {
        const resultRes = await fetch(`https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/${id}`, {
          headers: { Authorization: dfAuth },
        });
        const resultData = await resultRes.json();

        const items = resultData.tasks?.[0]?.result?.[0]?.items ?? [];
        const organicItems = items.filter((item: any) => item.type === "organic");

        let position: number | null = null;
        for (const item of organicItems) {
          if (item.domain && meta.client_domain && item.domain.includes(meta.client_domain)) {
            position = item.rank_absolute;
            break;
          }
        }

        rankInserts.push({
          keyword_id: meta.keyword_id,
          city_id: meta.city_id,
          position,
        });

        // Check for rank drops
        if (position !== null) {
          const { data: prevRanks } = await supabase
            .from("rank_history")
            .select("position")
            .eq("keyword_id", meta.keyword_id)
            .eq("city_id", meta.city_id)
            .order("checked_at", { ascending: false })
            .limit(1);

          const prevPosition = prevRanks?.[0]?.position;
          if (prevPosition !== null && prevPosition !== undefined && position - prevPosition >= 10) {
            const kw = (keywords as any[]).find((k: any) => k.id === meta.keyword_id);
            alerts.push({
              client_id: meta.client_id,
              keyword: kw?.keyword ?? "",
              old_pos: prevPosition,
              new_pos: position,
            });
          }
        }
      } catch (e) {
        console.error(`Failed to fetch result for task ${id}:`, e);
      }
    }

    // Insert rank history
    if (rankInserts.length > 0) {
      await supabase.from("rank_history").insert(rankInserts);
    }

    // Send alert emails
    if (alerts.length > 0 && RESEND_API_KEY) {
      const alertsByClient: Record<string, typeof alerts> = {};
      for (const a of alerts) {
        (alertsByClient[a.client_id] ??= []).push(a);
      }

      for (const [cid, clientAlerts] of Object.entries(alertsByClient)) {
        const { data: client } = await supabase.from("clients").select("*").eq("id", cid).single();
        if (!client?.alert_email) continue;

        const body = clientAlerts.map((a) => `• "${a.keyword}" dropped from #${a.old_pos} to #${a.new_pos}`).join("\n");

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: Deno.env.get("ALERT_FROM_EMAIL") ?? "alerts@rankradar.app",
            to: [client.alert_email],
            subject: `Rank drop alert — ${client.name}`,
            text: `Ranking drops detected for ${client.name}:\n\n${body}`,
          }),
        });
      }
    }

    // Trigger search volume fetch for each client
    for (const cid of clientIds) {
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fetch-search-volume`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_id: cid }),
      }).catch(() => {});
    }

    // If 1st of month, trigger suggestions
    const today = new Date();
    if (today.getDate() === 1) {
      for (const cid of clientIds) {
        fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-suggestions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ client_id: cid }),
        }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({ success: true, processed: rankInserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sync-rankings error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
