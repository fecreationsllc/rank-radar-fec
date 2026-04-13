import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, Calendar, Activity } from "lucide-react";
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
};

const PROVIDER_LABELS: Record<string, string> = {
  dataforseo: "DataForSEO",
  lovable_ai: "AI Gateway",
  anthropic: "AI (Anthropic)",
  resend: "Email (Resend)",
};

export function CostsTab({ client }: CostsTabProps) {
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
              <TableHead>Date</TableHead>
              <TableHead>Function</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead className="text-right">Tasks</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No API calls logged yet. Costs will appear after syncing rankings or generating suggestions.
                </TableCell>
              </TableRow>
            ) : (
              logs.slice(0, 50).map((log) => (
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
