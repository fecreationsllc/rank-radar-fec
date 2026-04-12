import { getPositionColor } from "@/lib/rank-utils";

export function PositionBadge({ position }: { position: number | null }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono-position ${getPositionColor(position)}`}>
      {position ?? "—"}
    </span>
  );
}
