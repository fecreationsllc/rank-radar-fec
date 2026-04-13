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
    const dfAuth = "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Get keywords and cities
    let keywordsQuery = supabase.from("keywords").select("*, clients(*)");
    if (clientId) keywordsQuery = keywordsQuery.eq("client_id", clientId);
    const { data: keywords } = await keywordsQuery;
    if (!keywords?.length) return new Response(JSON.stringify({ message: "No keywords" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const clientIds = [...new Set(keywords.map((k: any) => k.client_id))];
    const { data: cities } = await supabase.from("client_cities").select("*").in("client_id", clientIds);

    // Check for already-pending tasks for this client
    if (clientId) {
      const { data: pendingCheck } = await supabase
        .from("ranking_tasks")
        .select("id, created_at")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .limit(1);
      if (pendingCheck && pendingCheck.length > 0) {
        const taskAge = Date.now() - new Date(pendingCheck[0].created_at).getTime();
        const TEN_MINUTES = 10 * 60 * 1000;
        if (taskAge < TEN_MINUTES) {
          return new Response(JSON.stringify({ message: "Sync already in progress", task_count: 0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Stale pending tasks — delete them and proceed with fresh sync
        console.log(`Deleting ${pendingCheck.length} stale pending tasks for client ${clientId}`);
        await supabase
          .from("ranking_tasks")
          .delete()
          .eq("client_id", clientId)
          .eq("status", "pending");
      }
    }

    // Build tasks
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

    // Post tasks to DataForSEO
    const postRes = await fetch("https://api.dataforseo.com/v3/serp/google/organic/task_post", {
      method: "POST",
      headers: { Authorization: dfAuth, "Content-Type": "application/json" },
      body: JSON.stringify(tasks),
    });
    const postData = await postRes.json();

    if (postData.status_code !== 20000) {
      throw new Error(`DataForSEO task_post failed: ${JSON.stringify(postData)}`);
    }

    // Save task IDs to ranking_tasks table
    const taskInserts: any[] = [];
    for (let i = 0; i < (postData.tasks?.length ?? 0); i++) {
      const task = postData.tasks[i];
      if (task?.id) {
        taskInserts.push({
          client_id: taskMeta[i].client_id,
          dataforseo_task_id: task.id,
          keyword_id: taskMeta[i].keyword_id,
          city_id: taskMeta[i].city_id,
          status: "pending",
        });
      }
    }

    if (taskInserts.length > 0) {
      const { error: insertError } = await supabase.from("ranking_tasks").insert(taskInserts);
      if (insertError) {
        console.error("Failed to insert ranking_tasks:", insertError);
        throw new Error("Failed to save task metadata");
      }
    }

    // Log DataForSEO SERP cost
    if (taskInserts.length > 0) {
      const costPerTask = 0.002;
      const costByClient: Record<string, number> = {};
      for (const meta of taskMeta) {
        costByClient[meta.client_id] = (costByClient[meta.client_id] ?? 0) + 1;
      }
      for (const [cid, count] of Object.entries(costByClient)) {
        await supabase.from("api_usage_log").insert({
          client_id: cid,
          function_name: "sync-rankings",
          api_provider: "dataforseo",
          endpoint: "serp/google/organic/task_post",
          task_count: count,
          cost_usd: count * costPerTask,
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

    return new Response(JSON.stringify({ status: "queued", task_count: taskInserts.length }), {
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
