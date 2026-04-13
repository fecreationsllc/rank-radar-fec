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
    if (!clientId) throw new Error("client_id is required");

    const DATAFORSEO_LOGIN = Deno.env.get("DATAFORSEO_LOGIN")!;
    const DATAFORSEO_PASSWORD = Deno.env.get("DATAFORSEO_PASSWORD")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const dfAuth = "Basic " + btoa(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`);

    // Get pending tasks for this client
    const { data: pendingTasks } = await supabase
      .from("ranking_tasks")
      .select("*")
      .eq("client_id", clientId)
      .eq("status", "pending");

    if (!pendingTasks?.length) {
      return new Response(JSON.stringify({ status: "no_pending", completed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client domain for matching
    const { data: client } = await supabase.from("clients").select("*").eq("id", clientId).single();
    const clientDomain = client?.domain ?? "";

    // Get keywords for alert context
    const keywordIds = [...new Set(pendingTasks.map((t: any) => t.keyword_id))];
    const { data: keywords } = await supabase.from("keywords").select("*").in("id", keywordIds);

    const rankInserts: any[] = [];
    const completedTaskIds: string[] = [];
    const alerts: { keyword: string; old_pos: number; new_pos: number }[] = [];

    for (const task of pendingTasks) {
      try {
        const resultRes = await fetch(
          `https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/${task.dataforseo_task_id}`,
          { headers: { Authorization: dfAuth } }
        );
        const resultData = await resultRes.json();

        // Check if task is ready
        const taskResult = resultData.tasks?.[0];
        console.log(`Task ${task.dataforseo_task_id} — status_code: ${taskResult?.status_code}, items_length: ${taskResult?.result?.[0]?.items?.length ?? 0}`);
        
        if (!taskResult || taskResult.status_code === 40601) {
          console.log(`Task ${task.dataforseo_task_id} — not ready (status 40601), skipping`);
          continue;
        }

        const items = taskResult.result?.[0]?.items ?? [];
        const organicItems = items.filter((item: any) => item.type === "organic");

        // If no organic items and task is less than 5 minutes old, treat as "not ready"
        const taskAge = Date.now() - new Date(task.created_at).getTime();
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (organicItems.length === 0 && taskAge < FIVE_MINUTES) {
          console.log(`Task ${task.dataforseo_task_id} — 0 organic items but task is only ${Math.round(taskAge / 1000)}s old, skipping (not ready)`);
          continue;
        }

        // Log first 5 organic domains for debugging
        const sampleDomains = organicItems.slice(0, 5).map((it: any) => it.domain);
        console.log(`Task ${task.dataforseo_task_id} — clientDomain: "${clientDomain}", top5 organic domains:`, sampleDomains, `(${organicItems.length} total organic)`);

        // Normalize domain for comparison: strip www. and trailing dots
        const normalizeDomain = (d: string) => d?.toLowerCase().replace(/^www\./, "").replace(/\.$/, "") ?? "";
        const normalizedClient = normalizeDomain(clientDomain);

        let position: number | null = null;
        let rankedUrl: string | null = null;
        for (const item of organicItems) {
          const normalizedItem = normalizeDomain(item.domain ?? "");
          if (normalizedClient && normalizedItem && (
            normalizedItem.includes(normalizedClient) || normalizedClient.includes(normalizedItem)
          )) {
            position = item.rank_absolute;
            rankedUrl = item.url ?? null;
            break;
          }
        }

        rankInserts.push({
          keyword_id: task.keyword_id,
          city_id: task.city_id,
          position,
        });

        completedTaskIds.push(task.id);

        // Auto-populate landing page if not set
        if (rankedUrl) {
          const kw = (keywords ?? []).find((k: any) => k.id === task.keyword_id);
          if (kw && !kw.target_url) {
            await supabase.from("keywords").update({ target_url: rankedUrl }).eq("id", task.keyword_id);
          }
        }

        // Check for rank drops
        if (position !== null) {
          const { data: prevRanks } = await supabase
            .from("rank_history")
            .select("position")
            .eq("keyword_id", task.keyword_id)
            .eq("city_id", task.city_id)
            .order("checked_at", { ascending: false })
            .limit(1);

          const prevPosition = prevRanks?.[0]?.position;
          if (prevPosition !== null && prevPosition !== undefined && position - prevPosition >= 10) {
            const kw = (keywords ?? []).find((k: any) => k.id === task.keyword_id);
            alerts.push({
              keyword: kw?.keyword ?? "",
              old_pos: prevPosition,
              new_pos: position,
            });
          }
        }
      } catch (e) {
        console.error(`Failed to fetch result for task ${task.dataforseo_task_id}:`, e);
      }
    }

    // Insert rank history
    if (rankInserts.length > 0) {
      await supabase.from("rank_history").insert(rankInserts);
    }

    // Mark completed tasks
    if (completedTaskIds.length > 0) {
      await supabase
        .from("ranking_tasks")
        .update({ status: "completed" })
        .in("id", completedTaskIds);
    }

    // Send alert emails
    if (alerts.length > 0 && RESEND_API_KEY && client?.alert_email) {
      const body = alerts.map((a) => `• "${a.keyword}" dropped from #${a.old_pos} to #${a.new_pos}`).join("\n");

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

    const remaining = pendingTasks.length - completedTaskIds.length;

    return new Response(JSON.stringify({
      status: remaining > 0 ? "partial" : "complete",
      completed: completedTaskIds.length,
      remaining,
      total_ranks: rankInserts.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("fetch-ranking-results error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
