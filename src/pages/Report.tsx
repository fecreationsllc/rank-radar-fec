import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, Json } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PositionBadge } from "@/components/PositionBadge";
import { Sparkline } from "@/components/Sparkline";
import { getRankChange } from "@/lib/rank-utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, Target, TrendingUp, Hash } from "lucide-react";
import { format, subDays } from "date-fns";

const STATUS_OPTIONS = [
  { value: "monitoring", label: "Monitoring", className: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "optimizing", label: "Optimizing", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "low_priority", label: "Low Priority", className: "bg-gray-100 text-gray-500 border-gray-200" },
] as const;

function formatCityName(name: string) {
  return name.replace(/,(?!\s)/g, ", ");
}

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

interface Suggestion {
  rank: number;
  title: string;
  description: string;
  impact: string;
  effort: string;
  keywords_affected: string[];
}

export default function Report() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["report", token],
    queryFn: async () => {
      // Fetch client
      const { data: clients } = await supabase.from("clients").select("*").eq("report_token", token!).limit(1);
      const client = clients?.[0];
      if (!client) throw new Error("Not found");

      // Fetch cities, keywords, suggestions, competitors
      const [citiesRes, keywordsRes, suggestionsRes, competitorsRes] = await Promise.all([
        supabase.from("client_cities").select("*").eq("client_id", client.id),
        supabase.from("keywords").select("*").eq("client_id", client.id),
        supabase.from("seo_suggestions").select("*").eq("client_id", client.id).order("generated_at", { ascending: false }).limit(1),
        supabase.from("competitors").select("*").eq("client_id", client.id).eq("is_tracked", true),
      ]);

      const keywords = keywordsRes.data ?? [];
      const cities = citiesRes.data ?? [];

      // Fetch rank history and search volumes
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30).toISOString();
      const keywordIds = keywords.map((k) => k.id);
      const [historyRes, volumeRes] = keywordIds.length > 0
        ? await Promise.all([
            supabase.from("rank_history").select("*").in("keyword_id", keywordIds).gte("checked_at", thirtyDaysAgo).order("checked_at", { ascending: true }),
            supabase.from("keyword_search_volume").select("*").in("keyword_id", keywordIds),
          ])
        : [{ data: [] }, { data: [] }];
      const history = historyRes.data ?? [];
      const volumes = volumeRes.data ?? [];

      // Build rows
      const rows = [];
      for (const kw of keywords) {
        for (const city of cities) {
          const kwHistory = (history ?? []).filter((h) => h.keyword_id === kw.id && h.city_id === city.id);
          const today = kwHistory[kwHistory.length - 1]?.position ?? null;
          const monthAgo = kwHistory[0]?.position ?? null;
          const vol = volumes.find((v: any) => v.keyword_id === kw.id && v.city_id === city.id);
          rows.push({
            keyword: kw.keyword,
            status: kw.status,
            today,
            monthAgo,
            history: kwHistory.map((h) => h.position),
            city: city.city_name,
            searchVolume: (vol as any)?.search_volume ?? null,
          });
        }
      }

      rows.sort((a, b) => (a.today ?? 999) - (b.today ?? 999));

      const suggestions = suggestionsRes.data?.[0];
      const parsedSuggestions: Suggestion[] = suggestions
        ? parseSuggestionsJson(suggestions.suggestions)
        : [];

      return {
        client,
        cities: cities.map((c) => formatCityName(c.city_name)),
        rows,
        suggestions: parsedSuggestions,
        suggestionsDate: suggestions?.generated_at,
        competitors: competitorsRes.data ?? [],
      };
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Radar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Report not found</h1>
          <p className="text-muted-foreground">This report link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const { client, cities, rows, suggestions, suggestionsDate, competitors } = data;
  const now = new Date();
  const monthYear = format(now, "MMMM yyyy");

  const avgPosition = rows.length ? Math.round(rows.reduce((s, r) => s + (r.today ?? 0), 0) / rows.filter((r) => r.today !== null).length) || 0 : 0;
  const inTop10 = rows.filter((r) => r.today !== null && r.today <= 10).length;
  const improved = rows.filter((r) => r.today !== null && r.monthAgo !== null && r.today < r.monthAgo).length;

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Radar className="h-4 w-4" /> SEO Agency
        </div>
        <div className="text-right">
          <p className="font-semibold text-foreground">{client.name}</p>
          <p className="text-sm text-muted-foreground">{client.domain}</p>
        </div>
      </div>
      <h1 className="text-2xl font-bold mb-1">Monthly SEO Report — {monthYear}</h1>
      <p className="text-sm text-muted-foreground mb-8">{cities.join(", ")}</p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <ReportStatCard icon={<Target className="h-4 w-4" />} label="Avg Position" value={avgPosition || "—"} />
        <ReportStatCard icon={<Hash className="h-4 w-4" />} label="In Top 10" value={inTop10} />
        <ReportStatCard icon={<TrendingUp className="h-4 w-4" />} label="Improved" value={improved} />
      </div>

      {/* Keywords table */}
      <h2 className="text-lg font-semibold mb-3">Keyword Rankings</h2>
      <Card className="rounded-xl mb-8 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Position Today</TableHead>
              <TableHead>Last Month</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => {
              const change = getRankChange(row.today, row.monthAgo);
              return (
                <TableRow key={i}>
                  <TableCell className="font-medium">{row.keyword}</TableCell>
                  <TableCell>
                    {(() => {
                      const style = getStatusStyle(row.status);
                      return (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${style.className}`}>
                          {style.label}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.searchVolume !== null ? row.searchVolume.toLocaleString() : "—"}
                  </TableCell>
                  <TableCell><PositionBadge position={row.today} /></TableCell>
                  <TableCell><PositionBadge position={row.monthAgo} /></TableCell>
                  <TableCell>
                    {change && <span className={`text-sm font-medium ${change.color}`}>{change.text}</span>}
                  </TableCell>
                  <TableCell><Sparkline data={row.history} /></TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No ranking data yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* AI Suggestions */}
      <h2 className="text-lg font-semibold mb-3">Your top priorities this month</h2>
      {suggestions.length > 0 ? (
        <div className="space-y-4 mb-8">
          {suggestions.map((s) => (
            <Card key={s.rank} className="rounded-xl">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                    {s.rank}
                  </div>
                  <div>
                    <p className="font-semibold text-[15px]">{s.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant={s.impact === "high" ? "default" : "secondary"}>
                        {s.impact === "high" ? "High Impact" : "Medium Impact"}
                      </Badge>
                      <Badge variant="outline">
                        {s.effort === "low" ? "Low Effort" : s.effort === "medium" ? "Medium Effort" : "High Effort"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="rounded-xl mb-8">
          <CardContent className="py-8 text-center text-muted-foreground">
            Your SEO advisor is preparing your monthly recommendations.
          </CardContent>
        </Card>
      )}

      {/* Competitors */}
      {competitors.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3">How you compare</h2>
          <Card className="rounded-xl mb-8">
            <CardContent className="p-5">
              <div className="space-y-3">
                {competitors.map((comp) => (
                  <div key={comp.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="text-sm font-medium">{comp.domain}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Footer */}
      <div className="border-t pt-6 mt-8 text-center text-sm text-muted-foreground">
        <p>Powered by RankRadar</p>
        {client.alert_email && <p className="mt-1">Contact: {client.alert_email}</p>}
      </div>
    </div>
  );
}

function ReportStatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">{icon}{label}</div>
        <p className="text-2xl font-bold font-mono-position">{value}</p>
      </CardContent>
    </Card>
  );
}

function parseSuggestionsJson(json: Json): Suggestion[] {
  try {
    if (typeof json === "object" && json !== null && "suggestions" in json) return (json as any).suggestions;
    if (Array.isArray(json)) return json as any;
    return [];
  } catch { return []; }
}
