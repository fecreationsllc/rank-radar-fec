import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, Hash, TrendingUp, TrendingDown, Target, MousePointerClick, Eye, LayoutDashboard, AlertTriangle, WifiOff, CalendarOff } from "lucide-react";
import { subDays } from "date-fns";

interface ClientSummary {
  id: string;
  name: string;
  domain: string;
  keywordCount: number;
  avgPosition: number | null;
  inTop10: number;
  improved: number;
  declined: number;
  gscClicks: number;
  gscImpressions: number;
  lastSync: string | null;
  hasGsc: boolean;
}

export default function Overview() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const { data: summaries = [], isLoading } = useQuery({
    queryKey: ["overview-summaries"],
    queryFn: async () => {
      const now = new Date();
      const sevenDaysAgo = subDays(now, 7).toISOString();
      const twentyEightDaysAgo = subDays(now, 28).toISOString().split("T")[0];

      const [clientsRes, keywordsRes, historyRes, gscRes, gscConnRes] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: true }),
        supabase.from("keywords").select("id, client_id, keyword"),
        supabase.from("rank_history").select("keyword_id, position, checked_at, city_id").gte("checked_at", subDays(now, 30).toISOString()).order("checked_at", { ascending: true }),
        supabase.from("gsc_query_data").select("client_id, clicks, impressions, date").gte("date", twentyEightDaysAgo),
        supabase.from("client_gsc_connections").select("client_id"),
      ]);

      const clients = clientsRes.data ?? [];
      const keywords = keywordsRes.data ?? [];
      const history = historyRes.data ?? [];
      const gscRows = gscRes.data ?? [];
      const gscConns = new Set((gscConnRes.data ?? []).map((c) => c.client_id));

      // Index keywords by client
      const kwByClient = new Map<string, typeof keywords>();
      for (const kw of keywords) {
        const arr = kwByClient.get(kw.client_id) ?? [];
        arr.push(kw);
        kwByClient.set(kw.client_id, arr);
      }

      // Index history by keyword_id
      const histByKw = new Map<string, typeof history>();
      for (const h of history) {
        const arr = histByKw.get(h.keyword_id) ?? [];
        arr.push(h);
        histByKw.set(h.keyword_id, arr);
      }

      // Aggregate GSC by client
      const gscByClient = new Map<string, { clicks: number; impressions: number }>();
      for (const row of gscRows) {
        const existing = gscByClient.get(row.client_id) ?? { clicks: 0, impressions: 0 };
        existing.clicks += row.clicks ?? 0;
        existing.impressions += row.impressions ?? 0;
        gscByClient.set(row.client_id, existing);
      }

      return clients.map((client): ClientSummary => {
        const clientKws = kwByClient.get(client.id) ?? [];
        let positions: number[] = [];
        let improved = 0;
        let declined = 0;
        let latestSync: string | null = null;

        for (const kw of clientKws) {
          const kwHist = histByKw.get(kw.id) ?? [];
          if (!kwHist.length) continue;

          const latest = kwHist[kwHist.length - 1];
          if (latest.position !== null) positions.push(latest.position);

          // Track latest sync
          if (!latestSync || latest.checked_at > latestSync) latestSync = latest.checked_at;

          // Weekly change
          const weekAgoDate = subDays(now, 7);
          const weekRecord = kwHist.find((h) => new Date(h.checked_at) <= weekAgoDate) ?? kwHist[0];
          if (latest.position !== null && weekRecord?.position !== null) {
            if (latest.position < weekRecord.position) improved++;
            if (latest.position > weekRecord.position) declined++;
          }
        }

        const gsc = gscByClient.get(client.id);

        return {
          id: client.id,
          name: client.name,
          domain: client.domain,
          keywordCount: clientKws.length,
          avgPosition: positions.length ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
          inTop10: positions.filter((p) => p <= 10).length,
          improved,
          declined,
          gscClicks: gsc?.clicks ?? 0,
          gscImpressions: gsc?.impressions ?? 0,
          lastSync: latestSync,
          hasGsc: gscConns.has(client.id),
        };
      });
    },
  });

  const totals = summaries.reduce(
    (acc, s) => ({
      keywords: acc.keywords + s.keywordCount,
      inTop10: acc.inTop10 + s.inTop10,
      improved: acc.improved + s.improved,
      declined: acc.declined + s.declined,
      gscClicks: acc.gscClicks + s.gscClicks,
      gscImpressions: acc.gscImpressions + s.gscImpressions,
    }),
    { keywords: 0, inTop10: 0, improved: 0, declined: 0, gscClicks: 0, gscImpressions: 0 }
  );

  const sevenDaysAgo = subDays(new Date(), 7);

  return (
    <div className="flex min-h-screen">
      <aside className="w-[220px] flex-shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-sidebar-border">
          <Radar className="h-5 w-5" />
          <span className="font-bold text-base">RankRadar</span>
        </div>
        <div className="py-2">
          <button
            className="w-full text-left px-4 py-2.5 bg-sidebar-accent"
          >
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="text-sm font-medium text-sidebar-foreground">Overview</span>
            </div>
          </button>
          <button
            onClick={() => navigate("/")}
            className="w-full text-left px-4 py-2.5 hover:bg-sidebar-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-sidebar-foreground/60" />
              <span className="text-sm font-medium text-sidebar-foreground/80">Clients</span>
            </div>
          </button>
        </div>
        <div className="mt-auto p-4 border-t border-sidebar-border">
          <button onClick={signOut} className="text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 bg-background overflow-auto p-8">
        <h1 className="text-2xl font-bold mb-6">Overview</h1>

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Aggregate stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard icon={<Hash className="h-4 w-4" />} label="Total Keywords" value={totals.keywords} />
              <StatCard icon={<Target className="h-4 w-4" />} label="In Top 10" value={totals.inTop10} />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Improved ↑" value={totals.improved} color="text-emerald-600" />
              <StatCard icon={<TrendingDown className="h-4 w-4" />} label="Declined ↓" value={totals.declined} color="text-red-500" />
              <StatCard icon={<MousePointerClick className="h-4 w-4" />} label="GSC Clicks 28d" value={totals.gscClicks.toLocaleString()} />
              <StatCard icon={<Eye className="h-4 w-4" />} label="GSC Impr. 28d" value={totals.gscImpressions.toLocaleString()} />
            </div>

            {/* Per-client table */}
            {summaries.length === 0 ? (
              <Card className="rounded-xl">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Radar className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="font-medium">No clients yet</p>
                  <p className="text-sm mt-1">Add your first client to start tracking.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead className="text-right">Keywords</TableHead>
                      <TableHead className="text-right">Avg Position</TableHead>
                      <TableHead className="text-right">In Top 10</TableHead>
                      <TableHead className="text-right">Weekly Change</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead>Alerts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaries.map((s) => {
                      const noRecentSync = !s.lastSync || new Date(s.lastSync) < sevenDaysAgo;
                      const weeklyNet = s.improved - s.declined;

                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/?client=${s.id}`)}
                        >
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{s.domain}</TableCell>
                          <TableCell className="text-right">{s.keywordCount}</TableCell>
                          <TableCell className="text-right">{s.avgPosition ?? "—"}</TableCell>
                          <TableCell className="text-right">{s.inTop10}</TableCell>
                          <TableCell className="text-right">
                            {s.improved === 0 && s.declined === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="space-x-1">
                                {s.improved > 0 && <span className="text-emerald-600 text-sm font-medium">+{s.improved}</span>}
                                {s.declined > 0 && <span className="text-red-500 text-sm font-medium">-{s.declined}</span>}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {s.lastSync ? new Date(s.lastSync).toLocaleDateString() : "Never"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1.5">
                              {noRecentSync && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                                  <CalendarOff className="h-3 w-3" /> No sync 7d
                                </Badge>
                              )}
                              {s.declined > 0 && (
                                <Badge className="text-[10px] px-1.5 py-0 gap-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200">
                                  <AlertTriangle className="h-3 w-3" /> Declined
                                </Badge>
                              )}
                              {!s.hasGsc && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1 text-muted-foreground">
                                  <WifiOff className="h-3 w-3" /> No GSC
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )}
      </main>
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
