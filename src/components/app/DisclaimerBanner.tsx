import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const DISCLAIMER_TEXT =
  "HealthRisk AI is an educational and research platform. Predictions are generated using synthetic/anonymized data and must not be considered medical diagnosis, treatment, or professional medical advice.";

export function DisclaimerBanner({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "compact";
}) {
  return (
    <div
      role="note"
      className={cn(
        "border-warning/40 bg-warning/10 text-foreground flex items-start gap-3 rounded-xl border px-4 py-3",
        variant === "compact" && "px-3 py-2",
        className,
      )}
    >
      <ShieldAlert className="text-warning mt-0.5 size-4 shrink-0" />
      <p className={cn("text-muted-foreground text-xs leading-relaxed", variant === "default" && "text-[13px]")}>
        <span className="text-foreground font-semibold">Important: </span>
        {DISCLAIMER_TEXT}
      </p>
    </div>
  );
}
