import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardCard } from "@/components/app/DashboardCard";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { supabase } from "@/integrations/supabase/client";
import { getActiveUser, getUserDiseaseScores } from "@/lib/user-database";

export const Route = createFileRoute("/_shell/disease-analysis")({
  head: () => ({
    meta: [
      { title: "Disease Analysis — HealthRisk AI" },
      {
        name: "description",
        content:
          "Condition-level score distributions across the synthetic HealthRisk AI research cohort.",
      },
      { property: "og:title", content: "Disease Analysis — HealthRisk AI" },
      {
        property: "og:description",
        content: "Condition-level score distributions across synthetic research cohorts.",
      },
    ],
  }),
  component: DiseaseAnalysisPage,
});

type DiseaseRow = { disease_name: string; risk_score: number };

/** Only the most recent prediction per patient, so superseded runs don't skew the cohort. */
function useDiseaseScores() {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["disease-predictions", "latest", activeUser?.id],
    queryFn: async (): Promise<DiseaseRow[]> => {
      try {
        const local = getUserDiseaseScores(activeUser?.id);
        if (local && local.length > 0) return local;
        const { data, error } = await supabase
          .from("risk_predictions")
          .select("patient_id, prediction_date, disease_predictions(disease_name, risk_score)")
          .order("prediction_date", { ascending: false });
        if (!error && data && data.length > 0) {
          const seen = new Set<string>();
          const rows: DiseaseRow[] = [];
          for (const run of (data ?? []) as {
            patient_id: string;
            disease_predictions: DiseaseRow[] | null;
          }[]) {
            if (seen.has(run.patient_id)) continue;
            seen.add(run.patient_id);
            for (const d of run.disease_predictions ?? []) {
              rows.push({ disease_name: d.disease_name, risk_score: Number(d.risk_score) });
            }
          }
          return rows;
        }
      } catch {
        // fallback
      }
      return getUserDiseaseScores(activeUser?.id);
    },
  });
}

function DiseaseAnalysisPage() {
  const { data, isLoading, isError, refetch } = useDiseaseScores();

  const summary = useMemo(() => {
    if (!data || data.length === 0) return [];
    const grouped = new Map<string, number[]>();
    for (const row of data) {
      const list = grouped.get(row.disease_name) ?? [];
      list.push(Number(row.risk_score));
      grouped.set(row.disease_name, list);
    }
    return Array.from(grouped.entries())
      .map(([name, scores]) => ({
        name,
        count: scores.length,
        average: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)),
        max: Math.max(...scores),
      }))
      .sort((a, b) => b.average - a.average);
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Disease Analysis"
        description="Condition-level score patterns across the synthetic cohort. Descriptive statistics only — not diagnostic output."
        icon={Stethoscope}
      />

      <DisclaimerBanner />

      {isLoading ? (
        <DashboardCard title="Condition scores" description="Loading cohort statistics">
          <LoadingSkeleton rows={5} />
        </DashboardCard>
      ) : isError ? (
        <DashboardCard title="Condition scores" description="Could not load data">
          <ErrorState onRetry={() => void refetch()} />
        </DashboardCard>
      ) : summary.length === 0 ? (
        <DashboardCard title="Condition scores" description="Nothing to summarize">
          <EmptyState
            title="No condition scores available"
            description="No synthetic disease scores are stored for your account yet."
          />
        </DashboardCard>
      ) : (
        <>
          <DashboardCard
            title="Average score by condition"
            description="Mean synthetic score per condition across all scored records"
          >
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={54}
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    domain={[0, 100]}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                    contentStyle={{
                      borderRadius: "0.75rem",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="average"
                    name="Average score"
                    fill="var(--color-primary)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Condition breakdown"
            description={`${summary.length} conditions across ${data?.length ?? 0} scored records`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Condition</th>
                    <th className="py-2 pr-4 font-medium">Records</th>
                    <th className="py-2 pr-4 font-medium">Average score</th>
                    <th className="py-2 pr-4 font-medium">Highest score</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.name} className="border-border/60 border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium capitalize">{row.name}</td>
                      <td className="py-2.5 pr-4">{row.count}</td>
                      <td className="py-2.5 pr-4">{row.average}</td>
                      <td className="py-2.5 pr-4">{row.max}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </>
      )}
    </div>
  );
}
