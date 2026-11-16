import { cn } from "@/lib/utils";

export type RiskLevel = "low" | "moderate" | "high" | "critical" | "unknown";

const styles: Record<RiskLevel, string> = {
  low: "bg-success/15 text-success border-success/30",
  moderate: "bg-warning/15 text-warning border-warning/30",
  high: "bg-destructive/12 text-destructive border-destructive/30",
  critical: "bg-destructive text-destructive-foreground border-destructive",
  unknown: "bg-muted text-muted-foreground border-border",
};

const labels: Record<RiskLevel, string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  high: "High risk",
  critical: "Critical",
  unknown: "Not scored",
};

export function RiskBadge({
  level,
  score,
  className,
}: {
  level: RiskLevel;
  score?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        styles[level],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {labels[level]}
      {typeof score === "number" && <span className="opacity-70">· {score}%</span>}
    </span>
  );
}
