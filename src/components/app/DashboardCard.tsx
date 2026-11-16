import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardCard({
  title,
  description,
  icon: Icon,
  action,
  className,
  children,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn("card-surface hover:shadow-lift p-5", className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="bg-primary-soft text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-4.5" />
              </span>
            )}
            <div>
              {title && <h3 className="text-sm font-semibold">{title}</h3>}
              {description && (
                <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
              )}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "accent";
}) {
  const tones = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    accent: "bg-accent/15 text-accent",
  } as const;

  return (
    <div className="card-surface hover:shadow-lift p-5 hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="font-display mt-3 text-2xl font-semibold">{value}</p>
      {delta && <p className="text-muted-foreground mt-1 text-xs">{delta}</p>}
    </div>
  );
}
