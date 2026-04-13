import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, MousePointerClick, Eye, Target, TrendingUp, Sparkles, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

type SortColumn = "query" | "clicks" | "impressions" | "ctr" | "position" | "status";
type SortDirection = "asc" | "desc";

interface SearchConsoleTabProps {
  client: Tables<"clients">;
}

export function SearchConsoleTab({ client }: SearchConsoleTabProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("impressions");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data: connectionStatus } = useQuery({
    queryKey: ["gsc-status"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("gsc-auth", {
        body: { action: "status" },
      });
      return data as { connected: boolean; connected_at?: string };
    },
  });

  const { data: gscData = [], refetch } = useQuery({
    queryKey: ["gsc-data", client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("gsc_query_data")
        .select("*")
        .eq("client_id", client.id)
        .order("impressions", { ascending: false });
      return data ?? [];
    },
    enabled: connectionStatus?.connected === true,
  });

  const { data: trackedKeywords = [] } = useQuery({
    queryKey: ["keywords-list", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("keywords").select("keyword").eq("client_id", client.id);
      return (data ?? []).map((k) => k.keyword.toLowerCase());
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-gsc-data", {
        body: { client_id: client.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "GSC data synced", description: `${data.queries} query rows fetched` });
      refetch();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (!connectionStatus?.connected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Target className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold mb-2">Google Search Console not connected</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          Connect your Google account in the Settings tab to pull search performance data for this client.
        </p>
      </div>
    );
  }

  // Aggregate stats across all dates
  const queryMap = new Map<string, { clicks: number; impressions: number; ctrSum: number; posSum: number; count: number }>();
  for (const row of gscData) {
    const existing = queryMap.get(row.query) ?? { clicks: 0, impressions: 0, ctrSum: 0, posSum: 0, count: 0 };
    existing.clicks += row.clicks ?? 0;
    existing.impressions += row.impressions ?? 0;
    existing.ctrSum += Number(row.ctr ?? 0);
    existing.posSum += Number(row.position ?? 0);
    existing.count += 1;
    queryMap.set(row.query, existing);
  }

  const aggregated = Array.from(queryMap.entries())
    .map(([query, stats]) => ({
      query,
      clicks: stats.clicks,
      impressions: stats.impressions,
      ctr: stats.count > 0 ? stats.ctrSum / stats.count : 0,
      position: stats.count > 0 ? stats.posSum / stats.count : 0,
      isTracked: trackedKeywords.includes(query.toLowerCase()),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const totalClicks = aggregated.reduce((s, q) => s + q.clicks, 0);
  const totalImpressions = aggregated.reduce((s, q) => s + q.impressions, 0);
  const avgCtr = aggregated.length > 0 ? aggregated.reduce((s, q) => s + q.ctr, 0) / aggregated.length : 0;
  const avgPosition = aggregated.length > 0 ? aggregated.reduce((s, q) => s + q.position, 0) / aggregated.length : 0;
  const untrackedCount = aggregated.filter((q) => !q.isTracked).length;

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection(col === "query" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const sortedData = useMemo(() => {
    const arr = [...aggregated];
    const dir = sortDirection === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortColumn) {
        case "query": return dir * a.query.localeCompare(b.query);
        case "clicks": return dir * (a.clicks - b.clicks);
        case "impressions": return dir * (a.impressions - b.impressions);
        case "ctr": return dir * (a.ctr - b.ctr);
        case "position": return dir * (a.position - b.position);
        case "status": return dir * (Number(a.isTracked) - Number(b.isTracked));
        default: return 0;
      }
    });
    return arr;
  }, [aggregated, sortColumn, sortDirection]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Search Console</h2>
        <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Sync GSC
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="rounded-xl">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><MousePointerClick className="h-3.5 w-3.5" /> Clicks</div>
            <p className="text-2xl font-bold">{totalClicks.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Eye className="h-3.5 w-3.5" /> Impressions</div>
            <p className="text-2xl font-bold">{totalImpressions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3.5 w-3.5" /> Avg CTR</div>
            <p className="text-2xl font-bold">{(avgCtr * 100).toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Target className="h-3.5 w-3.5" /> Avg Position</div>
            <p className="text-2xl font-bold">{avgPosition.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Sparkles className="h-3.5 w-3.5" /> Opportunities</div>
            <p className="text-2xl font-bold">{untrackedCount}</p>
          </CardContent>
        </Card>
      </div>

      {aggregated.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="py-10 text-center text-muted-foreground">
            No GSC data yet. Click "Sync GSC" to pull data.
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl">
          <CardHeader><CardTitle className="text-base">Top Queries (Last 28 days)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
               <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("query")}>
                    <span className="inline-flex items-center">Query<SortIcon col="query" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("clicks")}>
                    <span className="inline-flex items-center justify-end w-full">Clicks<SortIcon col="clicks" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("impressions")}>
                    <span className="inline-flex items-center justify-end w-full">Impressions<SortIcon col="impressions" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("ctr")}>
                    <span className="inline-flex items-center justify-end w-full">CTR<SortIcon col="ctr" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("position")}>
                    <span className="inline-flex items-center justify-end w-full">Position<SortIcon col="position" /></span>
                  </TableHead>
                  <TableHead className="text-center cursor-pointer select-none" onClick={() => handleSort("status")}>
                    <span className="inline-flex items-center justify-center w-full">Status<SortIcon col="status" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregated.slice(0, 50).map((q) => (
                  <TableRow key={q.query}>
                    <TableCell className="font-medium">{q.query}</TableCell>
                    <TableCell className="text-right">{q.clicks.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{q.impressions.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{(q.ctr * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{q.position.toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      {q.isTracked ? (
                        <Badge variant="secondary" className="text-xs">Tracked</Badge>
                      ) : (
                        <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-200">Opportunity</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
