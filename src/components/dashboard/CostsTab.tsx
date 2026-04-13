import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Calendar, Activity, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface CostsTabProps {
  client: Tables<"clients">;
}

const PROVIDER_COLORS: Record<string, string> = {
  dataforseo: "hsl(var(--chart-1))",
  lovable_ai: "hsl(var(--chart-2))",
  anthropic: "hsl(var(--chart-3))",
  resend: "hsl(var(--chart-4))",
  google: "hsl(var(--chart-5))",
};

const PROVIDER_LABELS: Record<string, string> = {
  dataforseo: "DataForSEO",
  lovable_ai: "AI Gateway",
  anthropic: "AI (Anthropic)",
  resend: "Email (Resend)",
  google: "Google Cloud",
};

type SortColumn = "date" | "function" | "provider" | "endpoint" | "tasks" | "cost";
type SortDirection = "asc" | "desc";

export function CostsTab({ client }: CostsTabProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection(col === "function" || col === "provider" || col === "endpoint" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["api-usage", client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("api_usage_log")
        .select("*")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: allLogs = [] } = useQuery({
    queryKey: ["api-usage-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("api_usage_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      return data ?? [];
    },
  });

  const totalAllTime = allLogs.reduce((s, l) => s + Number(l.cost_usd), 0);
  const monthStart = startOfMonth(new Date()).toISOString();
  const thisMonth = allLogs.filter((l) => l.created_at >= monthStart);
  const totalThisMonth = thisMonth.reduce((s, l) => s + Number(l.cost_usd), 0);

  const clientTotal = logs.reduce((s, l) => s + Number(l.cost_usd), 0);
  const clientThisMonth = logs.filter((l) => l.created_at >= monthStart).reduce((s, l) => s + Number(l.cost_usd), 0);

  // By provider chart data
  const byProvider: Record<string, number> = {};
  for (const l of logs) {
    byProvider[l.api_provider] = (byProvider[l.api_provider] ?? 0) + Number(l.cost_usd);
  }
  const chartData = Object.entries(byProvider).map(([provider, cost]) => ({
    name: PROVIDER_LABELS[provider] ?? provider,
    cost: Math.round(cost * 1000000) / 1000000,
    provider,
  }));

  const sortedLogs = useMemo(() => {
    const arr = [...logs].slice(0, 50);
    const dir = sortDirection === "asc" ? 1 : -1;

    arr.sort((a, b) => {
      switch (sortColumn) {
        case "date":
          return ((a.created_at ?? "") > (b.created_at ?? "") ? 1 : -1) * dir;
        case "function":
          return a.function_name.localeCompare(b.function_name) * dir;
        case "provider":
          return a.api_provider.localeCompare(b.api_provider) * dir;
        case "endpoint":
          return (a.endpoint ?? "").localeCompare(b.endpoint ?? "") * dir;
        case "tasks":
          return ((a.task_count ?? 0) - (b.task_count ?? 0)) * dir;
        case "cost":
          return (Number(a.cost_usd) - Number(b.cost_usd)) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [logs, sortColumn, sortDirection]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Total (All Clients)" value={`$${totalAllTime.toFixed(4)}`} />
        <StatCard icon={<Calendar className="h-4 w-4" />} label="This Month (All)" value={`$${totalThisMonth.toFixed(4)}`} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label={`${client.name} Total`} value={`$${clientTotal.toFixed(4)}`} />
        <StatCard icon={<Activity className="h-4 w-4" />} label={`${client.name} This Month`} value={`$${clientThisMonth.toFixed(4)}`} />
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Cost by Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(6)}`, "Cost"]} />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.provider} fill={PROVIDER_COLORS[entry.provider] ?? "hsl(var(--chart-5))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Log table */}
      <Card className="rounded-xl overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent API Calls</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("date")}>
                <span className="flex items-center">Date <SortIcon col="date" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("function")}>
                <span className="flex items-center">Function <SortIcon col="function" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("provider")}>
                <span className="flex items-center">Provider <SortIcon col="provider" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => handleSort("endpoint")}>
                <span className="flex items-center">Endpoint <SortIcon col="endpoint" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("tasks")}>
                <span className="flex items-center justify-end">Tasks <SortIcon col="tasks" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("cost")}>
                <span className="flex items-center justify-end">Cost <SortIcon col="cost" /></span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No API calls logged yet. Costs will appear after syncing rankings or generating suggestions.
                </TableCell>
              </TableRow>
            ) : (
              sortedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{format(new Date(log.created_at), "MMM d, HH:mm")}</TableCell>
                  <TableCell className="text-sm font-medium">{log.function_name}</TableCell>
                  <TableCell className="text-sm">{PROVIDER_LABELS[log.api_provider] ?? log.api_provider}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.endpoint ?? "—"}</TableCell>
                  <TableCell className="text-sm text-right">{log.task_count}</TableCell>
                  <TableCell className="text-sm text-right font-mono">${Number(log.cost_usd).toFixed(4)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-bold font-mono text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}