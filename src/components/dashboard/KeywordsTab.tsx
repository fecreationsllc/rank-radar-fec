import { useState, useMemo } from "react";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Plus, RefreshCw, Search, TrendingUp, TrendingDown, Target, Hash, X, Sparkles, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { SuggestKeywordsModal } from "@/components/dashboard/SuggestKeywordsModal";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { subDays } from "date-fns";

const STATUS_OPTIONS = [
  { value: "monitoring", label: "Monitoring", className: "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200" },
  { value: "optimizing", label: "Optimizing", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200" },
  { value: "low_priority", label: "Low Priority", className: "bg-gray-100 text-gray-500 hover:bg-gray-200 border-gray-200" },
] as const;

function getStatusStyle(status: string) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

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
  searchVolume: number | null;
  volumeFetched: boolean;
}

type SortColumn = "keyword" | "landing_page" | "volume" | "today" | "week_change" | "last_week" | "last_month" | "city";
type SortDirection = "asc" | "desc";

export function KeywordsTab({ client }: KeywordsTabProps) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestedKeywords, setSuggestedKeywords] = useState<{ keyword: string; volume: number }[]>([]);
  const [hideNoVolume, setHideNoVolume] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("keyword");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncCompleted, setSyncCompleted] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection(col === "keyword" || col === "landing_page" || col === "city" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

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
      const [historyRes, volumeRes] = await Promise.all([
        supabase
          .from("rank_history")
          .select("*")
          .in("keyword_id", keywordIds)
          .gte("checked_at", thirtyDaysAgo)
          .order("checked_at", { ascending: true }),
        supabase
          .from("keyword_search_volume")
          .select("*")
          .in("keyword_id", keywordIds),
      ]);
      const history = historyRes.data;
      const volumes = volumeRes.data ?? [];

      const rows: KeywordWithRanks[] = [];
      for (const kw of keywords) {
        for (const city of citiesData) {
          const cityHistory = (history ?? []).filter((h) => h.keyword_id === kw.id && h.city_id === city.id);
          const todayRecord = cityHistory[cityHistory.length - 1];
          const weekAgoDate = subDays(now, 7);
          const weekRecord = cityHistory.find((h) => new Date(h.checked_at) <= weekAgoDate) ?? cityHistory[0];
          const monthRecord = cityHistory[0];

          const vol = volumes.find((v) => v.keyword_id === kw.id && v.city_id === city.id);
          rows.push({
            keyword: kw,
            city,
            today: todayRecord?.position ?? null,
            weekAgo: weekRecord?.position ?? null,
            monthAgo: monthRecord?.position ?? null,
            history: cityHistory.map((h) => h.position),
            searchVolume: vol?.search_volume ?? null,
            volumeFetched: !!vol,
          });
        }
      }

      if (citiesData.length === 0) {
        for (const kw of keywords) {
          rows.push({
            keyword: kw,
            city: { id: "", client_id: client.id, city_name: "No city", location_code: 0, is_primary: true, created_at: "" },
            today: null,
            weekAgo: null,
            monthAgo: null,
            history: [],
            searchVolume: null,
            volumeFetched: false,
          });
        }
      }

      return rows;
    },
  });

  const filtered = keywordRows.filter((r) => {
    if (!r.keyword.keyword.toLowerCase().includes(search.toLowerCase())) return false;
    if (hideNoVolume && (r.searchVolume === null || r.searchVolume === 0)) return false;
    return true;
  });
  const hiddenCount = hideNoVolume ? keywordRows.filter(r => r.keyword.keyword.toLowerCase().includes(search.toLowerCase()) && (r.searchVolume === null || r.searchVolume === 0)).length : 0;

  const sortedData = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      const nullToEnd = (va: number | null, vb: number | null) => {
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        return (va - vb) * dir;
      };

      switch (sortColumn) {
        case "keyword":
          return a.keyword.keyword.localeCompare(b.keyword.keyword) * dir;
        case "landing_page":
          return (a.keyword.target_url ?? "").localeCompare(b.keyword.target_url ?? "") * dir;
        case "volume":
          return nullToEnd(a.searchVolume, b.searchVolume);
        case "today":
          return nullToEnd(a.today, b.today);
        case "week_change": {
          const ca = a.today !== null && a.weekAgo !== null ? a.weekAgo - a.today : null;
          const cb = b.today !== null && b.weekAgo !== null ? b.weekAgo - b.today : null;
          return nullToEnd(ca, cb);
        }
        case "last_week":
          return nullToEnd(a.weekAgo, b.weekAgo);
        case "last_month":
          return nullToEnd(a.monthAgo, b.monthAgo);
        case "city":
          return a.city.city_name.localeCompare(b.city.city_name) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortColumn, sortDirection]);

  const avgPosition = filtered.length
    ? Math.round(filtered.reduce((s, r) => s + (r.today ?? 0), 0) / filtered.filter((r) => r.today !== null).length) || 0
    : 0;
  const inTop10 = filtered.filter((r) => r.today !== null && r.today <= 10).length;
  const improved = filtered.filter((r) => r.today !== null && r.weekAgo !== null && r.today < r.weekAgo).length;
  const declined = filtered.filter((r) => r.today !== null && r.weekAgo !== null && r.today > r.weekAgo).length;

  const handleSync = async () => {
    setSyncing(true);
    setSyncTotal(0);
    setSyncCompleted(0);
    try {
      const { data, error } = await supabase.functions.invoke("sync-rankings", { body: { client_id: client.id } });
      if (error) throw error;

      const taskCount = data?.task_count ?? 0;
      if (data?.message === "Sync already in progress") {
        toast({ title: "Sync already in progress", description: "Please wait for the current sync to finish." });
        setSyncing(false);
        return;
      }
      if (taskCount === 0) {
        toast({ title: "Nothing to sync", description: "No keywords or cities configured." });
        setSyncing(false);
        return;
      }

      setSyncTotal(taskCount);
      toast({ title: "Sync queued", description: `${taskCount} ranking checks submitted. Polling for results...` });

      let attempts = 0;
      const maxAttempts = 6;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const { data: pollData } = await supabase.functions.invoke("fetch-ranking-results", {
            body: { client_id: client.id },
          });

          const completed = pollData?.completed ?? 0;
          setSyncCompleted(completed);

          if (pollData?.status === "complete" || pollData?.status === "no_pending") {
            clearInterval(pollInterval);
            setSyncing(false);
            setSyncTotal(0);
            setSyncCompleted(0);
            queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
            toast({ title: "Rankings updated", description: `${pollData?.total_ranks ?? 0} results processed.` });
          } else if (pollData?.status === "partial" && completed > 0) {
            queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
          }

          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setSyncing(false);
            setSyncTotal(0);
            setSyncCompleted(0);
            if (pollData?.remaining > 0) {
              toast({ title: "Still processing", description: "Some results are still pending. They'll appear on next sync or page refresh." });
            }
            queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setSyncing(false);
            setSyncTotal(0);
            setSyncCompleted(0);
            queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
          }
        }
      }, 10000);
      // Start first poll sooner
      setTimeout(async () => {
        try {
          const { data: pollData } = await supabase.functions.invoke("fetch-ranking-results", {
            body: { client_id: client.id },
          });
          const completed = pollData?.completed ?? 0;
          setSyncCompleted(completed);
          if (pollData?.status === "complete" || pollData?.status === "no_pending") {
            clearInterval(pollInterval);
            setSyncing(false);
            setSyncTotal(0);
            setSyncCompleted(0);
            queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
            toast({ title: "Rankings updated", description: `${pollData?.total_ranks ?? 0} results processed.` });
          }
        } catch {}
      }, 20000);
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
      setSyncing(false);
      setSyncTotal(0);
      setSyncCompleted(0);
    }
  };

  const handleRemoveKeyword = async (keywordId: string) => {
    await supabase.from("keywords").delete().eq("id", keywordId);
    queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
  };

  const handleStatusChange = async (keywordId: string, newStatus: string) => {
    await supabase.from("keywords").update({ status: newStatus } as any).eq("id", keywordId);
    queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
  };

  const handleSuggest = async () => {
    setSuggestOpen(true);
    setSuggesting(true);
    setSuggestedKeywords([]);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-more-keywords", {
        body: { client_id: client.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestedKeywords((data?.keywords ?? []) as { keyword: string; volume: number }[]);
    } catch (e) {
      console.error("Suggest keywords error:", e);
      toast({ title: "Failed to get suggestions", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
      setSuggestOpen(false);
    } finally {
      setSuggesting(false);
    }
  };

  const handleAddSuggested = async (keywords: string[]) => {
    if (!keywords.length) return;
    const rows = keywords.map(kw => ({ client_id: client.id, keyword: kw }));
    await supabase.from("keywords").insert(rows);
    queryClient.invalidateQueries({ queryKey: ["keywords-with-ranks", client.id] });
    setSuggestOpen(false);
    toast({ title: `Added ${keywords.length} keyword${keywords.length > 1 ? "s" : ""}` });
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
        <Button variant="secondary" onClick={handleSuggest} disabled={suggesting || keywordRows.length === 0}>
          <Sparkles className="h-4 w-4 mr-1" /> Suggest More
        </Button>
        <Button variant="outline" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} /> Sync Now
        </Button>
        <Button
          variant={hideNoVolume ? "default" : "outline"}
          size="sm"
          onClick={() => setHideNoVolume(!hideNoVolume)}
        >
          {hideNoVolume ? `Show All (${hiddenCount} hidden)` : "Hide No Volume"}
        </Button>
      </div>

      {/* Sync progress */}
      {syncing && (
        <Card className="rounded-xl">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>
                {syncTotal > 0 && syncCompleted > 0
                  ? `Syncing rankings... ${syncCompleted} of ${syncTotal} completed`
                  : syncTotal > 0
                  ? `Waiting for results... (${syncTotal} tasks queued)`
                  : "Starting sync..."}
              </span>
            </div>
            <Progress
              value={syncTotal > 0 && syncCompleted > 0 ? (syncCompleted / syncTotal) * 100 : undefined}
              className={`h-2 ${syncTotal > 0 && syncCompleted === 0 ? "animate-pulse" : ""}`}
            />
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {sortedData.length === 0 ? (
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
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("keyword")}>
                  <span className="flex items-center">Keyword <SortIcon col="keyword" /></span>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("landing_page")}>
                  <span className="flex items-center">Landing Page <SortIcon col="landing_page" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("volume")}>
                  <span className="flex items-center">Volume <SortIcon col="volume" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("today")}>
                  <span className="flex items-center">Today <SortIcon col="today" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("week_change")}>
                  <span className="flex items-center">Week <SortIcon col="week_change" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("last_week")}>
                  <span className="flex items-center">Last Week <SortIcon col="last_week" /></span>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("last_month")}>
                  <span className="flex items-center">Last Month <SortIcon col="last_month" /></span>
                </TableHead>
                <TableHead>Trend</TableHead>
                {multiCity && (
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("city")}>
                    <span className="flex items-center">City <SortIcon col="city" /></span>
                  </TableHead>
                )}
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((row, i) => {
                const weekChange = getRankChange(row.today, row.weekAgo);
                return (
                  <TableRow key={`${row.keyword.id}-${row.city.id}-${i}`}>
                    <TableCell className="font-medium">{row.keyword.keyword}</TableCell>
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border cursor-pointer transition-colors ${getStatusStyle((row.keyword as any).status ?? "monitoring").className}`}>
                            {getStatusStyle((row.keyword as any).status ?? "monitoring").label}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-36 p-1" align="start">
                          {STATUS_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted flex items-center gap-2"
                              onClick={() => handleStatusChange(row.keyword.id, opt.value)}
                            >
                              <span className={`inline-block w-2 h-2 rounded-full ${opt.value === "monitoring" ? "bg-blue-500" : opt.value === "optimizing" ? "bg-emerald-500" : "bg-gray-400"}`} />
                              {opt.label}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                      {row.keyword.target_url ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.searchVolume !== null ? row.searchVolume.toLocaleString() : row.volumeFetched ? "N/A" : "—"}
                    </TableCell>
                    <TableCell>
                      {row.today !== null ? (
                        <PositionBadge position={row.today} />
                      ) : row.history.length > 0 ? (
                        <span className="text-xs text-muted-foreground">100+</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
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

      <SuggestKeywordsModal
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        keywords={suggestedKeywords}
        loading={suggesting}
        onAdd={handleAddSuggested}
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