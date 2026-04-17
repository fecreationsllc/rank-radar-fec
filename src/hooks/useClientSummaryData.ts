import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfWeek, format, eachDayOfInterval } from "date-fns";

export interface ClientSummaryData {
  totalKeywords: number;
  improvedThisMonth: number;
  weeklyAvgPosition: { week: string; position: number | null }[];
  positionBuckets: { bucket: string; count: number }[];
  dailyImpressions: { date: string; impressions: number }[];
  hasAnyData: boolean;
}

export function useClientSummaryData(clientId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["client-summary", clientId],
    enabled: !!clientId && enabled,
    queryFn: async (): Promise<ClientSummaryData> => {
      const now = new Date();
      const ninetyDaysAgo = subDays(now, 90).toISOString();
      const twentyEightDaysAgo = subDays(now, 28);

      const [kwRes, histRes, gscRes] = await Promise.all([
        supabase.from("keywords").select("id").eq("client_id", clientId!),
        supabase
          .from("rank_history")
          .select("keyword_id, position, checked_at")
          .gte("checked_at", ninetyDaysAgo)
          .order("checked_at", { ascending: true }),
        supabase
          .from("gsc_query_data")
          .select("date, impressions")
          .eq("client_id", clientId!)
          .gte("date", format(twentyEightDaysAgo, "yyyy-MM-dd")),
      ]);

      const keywords = kwRes.data ?? [];
      const allHistory = histRes.data ?? [];
      const gsc = gscRes.data ?? [];

      const kwIds = new Set(keywords.map((k) => k.id));
      const history = allHistory.filter((h) => kwIds.has(h.keyword_id));

      // Index history by keyword
      const histByKw = new Map<string, typeof history>();
      for (const h of history) {
        const arr = histByKw.get(h.keyword_id) ?? [];
        arr.push(h);
        histByKw.set(h.keyword_id, arr);
      }

      // Headline: improved this month (current vs ~30 days ago)
      const monthAgoDate = subDays(now, 30);
      let improved = 0;
      const currentPositions: number[] = [];
      for (const kwId of kwIds) {
        const h = histByKw.get(kwId) ?? [];
        if (!h.length) continue;
        const latest = h[h.length - 1];
        if (latest.position == null) continue;
        currentPositions.push(latest.position);

        const monthRecord =
          [...h].reverse().find((r) => new Date(r.checked_at) <= monthAgoDate) ?? h[0];
        if (monthRecord?.position != null && latest.position < monthRecord.position) {
          improved++;
        }
      }

      // 12-week avg position
      const weeks: { week: string; position: number | null }[] = [];
      for (let i = 11; i >= 0; i--) {
        const weekStart = startOfWeek(subDays(now, i * 7), { weekStartsOn: 1 });
        const weekEnd = subDays(weekStart, -7);
        const positions: number[] = [];
        for (const h of history) {
          const d = new Date(h.checked_at);
          if (d >= weekStart && d < weekEnd && h.position != null) {
            positions.push(h.position);
          }
        }
        weeks.push({
          week: format(weekStart, "MMM d"),
          position: positions.length
            ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
            : null,
        });
      }

      // Position buckets from current positions
      const buckets = [
        { bucket: "Top 3", count: currentPositions.filter((p) => p <= 3).length },
        { bucket: "Top 10", count: currentPositions.filter((p) => p > 3 && p <= 10).length },
        { bucket: "Top 30", count: currentPositions.filter((p) => p > 10 && p <= 30).length },
        { bucket: "Beyond", count: currentPositions.filter((p) => p > 30).length },
      ];

      // Daily impressions (28d)
      const impMap = new Map<string, number>();
      for (const row of gsc) {
        impMap.set(row.date, (impMap.get(row.date) ?? 0) + (row.impressions ?? 0));
      }
      const days = eachDayOfInterval({ start: twentyEightDaysAgo, end: now });
      const dailyImpressions = days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        return { date: format(d, "MMM d"), impressions: impMap.get(key) ?? 0 };
      });

      return {
        totalKeywords: keywords.length,
        improvedThisMonth: improved,
        weeklyAvgPosition: weeks,
        positionBuckets: buckets,
        dailyImpressions,
        hasAnyData: history.length > 0 || gsc.length > 0,
      };
    },
  });
}
