import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PositionBadge } from "@/components/PositionBadge";
import { Sparkline } from "@/components/Sparkline";
import { getRankChange } from "@/lib/rank-utils";
import { AddKeywordsModal } from "@/components/dashboard/AddKeywordsModal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCw, Search, TrendingUp, TrendingDown, Target, Hash, X, Sparkles } from "lucide-react";
import { SuggestKeywordsModal } from "@/components/dashboard/SuggestKeywordsModal";
import { Badge } from "@/components/ui/badge";
import { subDays } from "date-fns";

interface KeywordsTabProps {
  client: Tables<"clients">;
}

interface KeywordWithRanks {
  keyword: Tables<"keywords">;
  city: Tables<"client_cities">;
  today: number | null;
  weekAgo: number | null;
  monthAgo: number | null;
  history: (number | null)[];
}

export function KeywordsTab({ client }: KeywordsTabProps) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cities = [] } = useQuery({
    queryKey: ["cities", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("client_cities").select("*").eq("client_id", client.id);
      return data ?? [];
    },
  });

  const { data: keywordRows = [], isLoading } = useQuery({
    queryKey: ["keywords-with-ranks", client.id],
    queryFn: async () => {
      const { data: keywords } = await supabase.from("keywords").select("*").eq("client_id", client.id);
      if (!keywords?.length) return [];

      const { data: citiesData } = await supabase.from("client_cities").select("*").eq("client_id", client.id);
      if (!citiesData?.length) return [];

      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30).toISOString();

      const keywordIds = keywords.map((k) => k.id);
      const { data: history } = await supabase
        .from("rank_history")
        .select("*")
        .in("keyword_id", keywordIds)
        .gte("checked_at", thirtyDaysAgo)
        .order("checked_at", { ascending: true });

      const rows: KeywordWithRanks[] = [];
      for (const kw of keywords) {
        for (const city of citiesData) {
          const cityHistory = (history ?? []).filter((h) => h.keyword_id === kw.id && h.city_id === city.id);
          const todayRecord = cityHistory[cityHistory.length - 1];
          const weekAgoDate = subDays(now, 7);
          const weekRecord = cityHistory.find((h) => new Date(h.checked_at) <= weekAgoDate) ?? cityHistory[0];
          const monthRecord = cityHistory[0];

          rows.push({
            keyword: kw,
            city,
            today: todayRecord?.position ?? null,
            weekAgo: weekRecord?.position ?? null,
            monthAgo: monthRecord?.position ?? null,
            history: cityHistory.map((h) => h.position),
          });
        }
      }

      // If no cities, show keywords without city association
      if (citiesData.length === 0) {
        for (const kw of keywords) {
          rows.push({
            keyword: kw,
            city: { id: "", client_id: client.id, city_name: "No city", location_code: 0, is_primary: true, created_at: "" },
            today: null,
            weekAgo: null,
            monthAgo: null,
            history: [],
          });
        }
      }

      return rows;
    },
  });

  const filtered = keywordRows.filter((r) => r.keyword.keyword.toLowerCase().includes(search.toLowerCase()));

  const avgPosition = filtered.length
    ? Math.round(filtered.reduce((s, r) => s + (r.today ?? 0), 0) / filtered.filter((r) => r.today !== null).length) || 0
    : 0;
  const inTop10 = filtered.filter((r) => r.today !== null && r.today <= 10).length;
  const improved = filtered.filter((r) => r.today !== null && r.weekAgo !== null && r.today < r.weekAgo).length;
  const declined = filtered.filter((r) => r.today !== null && r.weekAgo !== null && r.today > r.weekAgo).length;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke("sync-rankings", { body: { client_id: client.id } });
      toast({ title: "Sync started", description: "Rankings will be updated shortly." });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] }), 5000);
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    }
    setSyncing(false);
  };

  const handleRemoveKeyword = async (keywordId: string) => {
    await supabase.from("keywords").delete().eq("id", keywordId);
    queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
  };

  const multiCity = cities.length > 1;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<Target className="h-4 w-4" />} label="Avg Position" value={avgPosition || "—"} />
        <StatCard icon={<Hash className="h-4 w-4" />} label="In Top 10" value={inTop10} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Improved ↑" value={improved} color="text-emerald-600" />
        <StatCard icon={<TrendingDown className="h-4 w-4" />} label="Declined ↓" value={declined} color="text-red-500" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search keywords..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Keywords
        </Button>
        <Button variant="outline" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync Now
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Target className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">No keywords yet</p>
            <p className="text-sm mt-1">Add keywords to start tracking your client's rankings.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Keyword</TableHead>
                <TableHead>Landing Page</TableHead>
                <TableHead>Today</TableHead>
                <TableHead>Δ Week</TableHead>
                <TableHead>Last Week</TableHead>
                <TableHead>Last Month</TableHead>
                <TableHead>Trend</TableHead>
                {multiCity && <TableHead>City</TableHead>}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, i) => {
                const weekChange = getRankChange(row.today, row.weekAgo);
                return (
                  <TableRow key={`${row.keyword.id}-${row.city.id}-${i}`}>
                    <TableCell className="font-medium">{row.keyword.keyword}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                      {row.keyword.target_url ?? "—"}
                    </TableCell>
                    <TableCell><PositionBadge position={row.today} /></TableCell>
                    <TableCell>
                      {weekChange && <span className={`text-sm font-medium ${weekChange.color}`}>{weekChange.text}</span>}
                    </TableCell>
                    <TableCell><PositionBadge position={row.weekAgo} /></TableCell>
                    <TableCell><PositionBadge position={row.monthAgo} /></TableCell>
                    <TableCell><Sparkline data={row.history} /></TableCell>
                    {multiCity && (
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{row.city.city_name}</Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <button onClick={() => handleRemoveKeyword(row.keyword.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <AddKeywordsModal
        open={addOpen}
        onOpenChange={setAddOpen}
        clientId={client.id}
        onKeywordsAdded={() => queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] })}
      />
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color?: string }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          {icon}
          {label}
        </div>
        <p className={`text-2xl font-bold font-mono-position ${color ?? "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
