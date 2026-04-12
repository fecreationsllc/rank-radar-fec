export function getPositionColor(position: number | null): string {
  if (position === null) return "bg-muted text-muted-foreground";
  if (position <= 3) return "bg-[hsl(var(--rank-top3-bg))] text-[hsl(var(--rank-top3-fg))]";
  if (position <= 10) return "bg-[hsl(var(--rank-top10-bg))] text-[hsl(var(--rank-top10-fg))]";
  if (position <= 30) return "bg-[hsl(var(--rank-top30-bg))] text-[hsl(var(--rank-top30-fg))]";
  return "bg-[hsl(var(--rank-rest-bg))] text-[hsl(var(--rank-rest-fg))]";
}

export function getRankChange(today: number | null, previous: number | null): { text: string; color: string } | null {
  if (today === null || previous === null) return { text: "—", color: "text-muted-foreground" };
  const diff = previous - today;
  if (diff > 0) return { text: `↑${diff}`, color: "text-emerald-600" };
  if (diff < 0) return { text: `↓${Math.abs(diff)}`, color: "text-red-500" };
  return { text: "—", color: "text-muted-foreground" };
}

export function cleanDomain(input: string): string {
  return input.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/^www\./, "");
}
