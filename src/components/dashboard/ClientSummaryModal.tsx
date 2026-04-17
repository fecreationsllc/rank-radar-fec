import { useRef, useState } from "react";
import { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, FileImage, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import html2canvas from "html2canvas";
import { useClientSummaryData } from "@/hooks/useClientSummaryData";
import { format } from "date-fns";

interface ClientSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Tables<"clients">;
}

export function ClientSummaryModal({ open, onOpenChange, client }: ClientSummaryModalProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading } = useClientSummaryData(client.id, open);

  const handleDownload = async () => {
    if (!captureRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `${client.domain}-summary-${format(new Date(), "yyyy-MM-dd")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  const headline = data
    ? `Rankings improved for ${data.improvedThisMonth} of ${data.totalKeywords} keywords this month.`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] overflow-y-auto p-0 bg-muted/30">
        {/* Top action bar (excluded from capture) */}
        <div className="flex items-center justify-end gap-2 px-6 pt-6 pb-2">
          <Button onClick={handleDownload} disabled={downloading || isLoading} size="sm">
            {downloading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Camera className="h-4 w-4 mr-1.5" />
            )}
            Download as Image
          </Button>
        </div>

        {/* Capture area */}
        <div ref={captureRef} className="px-8 pb-10 pt-4 bg-muted/30">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">{client.name}</h1>
            <p className="text-base text-muted-foreground mt-1">{client.domain}</p>
            {isLoading ? (
              <Skeleton className="h-6 w-96 mt-4" />
            ) : data && data.totalKeywords > 0 ? (
              <p className="text-lg text-foreground mt-4 font-medium">{headline}</p>
            ) : null}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-72 rounded-2xl" />
              ))}
            </div>
          ) : !data || !data.hasAnyData ? (
            <div className="bg-card rounded-2xl p-16 text-center">
              <FileImage className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <p className="font-medium text-foreground">No data to summarize yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add keywords and run a sync to generate a client report.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <ChartCard title="Rankings improving" caption="Lower is better">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={data.weeklyAvgPosition}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      reversed
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="position"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "hsl(var(--primary))" }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Visibility breakdown" caption="Keywords by current position">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.positionBuckets}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="bucket"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                      cursor={{ fill: "hsl(var(--muted))" }}
                    />
                    <Bar
                      dataKey="count"
                      fill="hsl(var(--primary))"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Search appearances" caption="Impressions, last 28 days">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={data.dailyImpressions}
                    margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      interval={6}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="impressions"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Footer */}
          <p className="text-xs text-muted-foreground/70 text-center mt-8">
            Report generated {format(new Date(), "MMMM d, yyyy")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChartCard({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-2xl p-6 shadow-sm border border-border/40">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {caption && <p className="text-xs text-muted-foreground mt-0.5 mb-3">{caption}</p>}
      {!caption && <div className="mb-3" />}
      {children}
    </div>
  );
}
