import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, Settings, ShieldCheck, UserRound } from "lucide-react";
import { DashboardCard } from "@/components/app/DashboardCard";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({
    meta: [
      { title: "Settings — HealthRisk AI" },
      { name: "description", content: "Review your account profile, assigned research role and workspace appearance preferences." },
      { property: "og:title", content: "Settings — HealthRisk AI" },
      { property: "og:description", content: "Review your account profile, assigned research role and workspace appearance preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const ROLE_NOTES: Record<string, string> = {
  admin: "Full access: can read, write and delete research records.",
  researcher: "Can read and write patient, measurement and prediction records.",
  analyst: "Read-only access to research data.",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/70 flex items-center justify-between gap-4 border-b py-2.5 last:border-b-0">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

type AuditRow = { id: string; action: string; timestamp: string };

function useRecentActivity(userId: string | undefined) {
  return useQuery({
    queryKey: ["audit-logs", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, timestamp")
        .order("timestamp", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function SettingsPage() {
  const { user, profile, roles, canWriteResearch } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const activity = useRecentActivity(user?.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your account profile, assigned research role and workspace appearance preferences."
        icon={Settings}
      />
      <DisclaimerBanner />

      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard title="Profile" description="Details from your account record" icon={UserRound}>
          <Row label="Name" value={profile?.full_name || "—"} />
          <Row label="Email" value={profile?.email || user?.email || "—"} />
          <Row label="User ID" value={user?.id ?? "—"} />
        </DashboardCard>

        <DashboardCard title="Access role" description="Roles are stored server-side and enforced by the database" icon={ShieldCheck}>
          <Row label="Assigned role" value={roles.length ? roles.join(", ") : "none"} />
          <Row label="Write access" value={canWriteResearch ? "Enabled" : "Read-only"} />
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
            {ROLE_NOTES[roles[0] ?? ""] ?? "No role assigned yet. Contact an administrator."}
          </p>
        </DashboardCard>
      </div>

      <DashboardCard
        title="Recent activity"
        description="Your last 10 recorded actions in this workspace"
        icon={History}
      >
        {activity.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : activity.isError ? (
          <ErrorState onRetry={() => void activity.refetch()} />
        ) : !activity.data || activity.data.length === 0 ? (
          <EmptyState title="No activity yet" description="Your actions will appear here." />
        ) : (
          <ul className="text-sm">
            {activity.data.map((row) => (
              <li
                key={row.id}
                className="border-border/70 flex items-center justify-between gap-4 border-b py-2 last:border-b-0"
              >
                <span className="font-medium">{row.action}</span>
                <span className="text-muted-foreground text-xs">
                  {new Date(row.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardCard>

      <DashboardCard title="Appearance" description="Applies to this browser only">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Current theme: <span className="text-foreground font-medium capitalize">{theme}</span>
          </p>
          <Button size="sm" variant="outline" onClick={toggleTheme}>
            Switch to {theme === "dark" ? "light" : "dark"}
          </Button>
        </div>
      </DashboardCard>
    </div>
  );
}
