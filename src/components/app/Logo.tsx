import { HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="bg-brand-gradient shadow-soft flex size-9 items-center justify-center rounded-xl">
        <HeartPulse className="text-primary-foreground size-5" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[15px] font-semibold tracking-tight">
            HealthRisk <span className="text-gradient-brand">AI</span>
          </span>
          <span className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">
            Predict · Explain
          </span>
        </span>
      )}
    </div>
  );
}
