import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { EmptyState } from "./States";
import { DisclaimerBanner } from "./DisclaimerBanner";

export function PageHeader({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="bg-primary-soft text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
        <Icon className="size-5" />
      </span>
      <div>
        <h1 className="font-display text-xl font-semibold sm:text-2xl">{title}</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>
      </div>
    </div>
  );
}

export function PagePlaceholder({
  title,
  description,
  icon,
  planned,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  planned: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} icon={icon} />
      <DisclaimerBanner />
      <EmptyState
        icon={Construction}
        title="This module is scaffolded, not implemented"
        description="The interface foundation is ready. Data pipelines and model logic will be connected in a later stage."
      />
      <DashboardCard title="Planned capabilities" description="Scope for the next build phase">
        <ul className="grid gap-2 sm:grid-cols-2">
          {planned.map((item) => (
            <li
              key={item}
              className="border-border/70 bg-muted/40 text-muted-foreground rounded-lg border px-3 py-2.5 text-xs"
            >
              {item}
            </li>
          ))}
        </ul>
      </DashboardCard>
    </div>
  );
}
