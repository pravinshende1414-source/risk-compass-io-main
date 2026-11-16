import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LoadingSkeleton({
  rows = 3,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card-surface flex items-center gap-4 p-4">
          <div className="bg-muted size-10 shrink-0 animate-pulse rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="bg-muted h-3 w-2/5 animate-pulse rounded" />
            <div className="bg-muted h-3 w-3/5 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border/70 bg-surface-gradient flex flex-col items-center rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <span className="bg-primary-soft text-primary flex size-12 items-center justify-center rounded-2xl">
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      {description && (
        <p className="text-muted-foreground mt-1 max-w-sm text-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Please try again.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-destructive/30 bg-destructive/5 flex flex-col items-center rounded-xl border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="bg-destructive/15 text-destructive flex size-12 items-center justify-center rounded-2xl">
        <AlertTriangle className="size-5" />
      </span>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-xs leading-relaxed">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
