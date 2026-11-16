import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Brain } from "lucide-react";
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
import { ShapExplainer } from "@/components/app/ShapExplainer";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { correlation, mean, useCohortPatients, useCohortPredictions } from "@/lib/cohort";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/explainable-ai")({
  head: () => ({
    meta: [
      { title: "Explainable AI — HealthRisk AI" },
      { name: "description", content: "See which cohort features move the stored risk estimates." },
      { property: "og:title", content: "Explainable AI — HealthRisk AI" },
      { property: "og:description", content: "See which cohort features move the stored risk estimates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExplainableAiPage,
});

const FEATURES: {
  key: "age" | "bmi" | "heart_rate" | "glucose" | "cholesterol";
  label: string;
  description: string;
}[] = [
  { key: "age", label: "Age", description: "Age in years at record creation" },
  { key: "bmi", label: "BMI", description: "Body mass index (kg/m²)" },
  { key: "heart_rate", label: "Heart rate", description: "Resting beats per minute" },
  { key: "glucose", label: "Glucose", description: "Fasting glucose (mg/dL)" },
  { key: "cholesterol", label: "Cholesterol", description: "Total cholesterol (mg/dL)" },
];

function ExplainableAiPage() {
  const patients = useCohortPatients();
  const predictions = useCohortPredictions();

  const isLoading = patients.isLoading || predictions.isLoading;
  const isError = patients.isError || predictions.isError;

  const ranking = useMemo(() => {
    if (!patients.data || !predictions.data) return [];
    const riskByPatient = new Map<string, number[]>();
    for (const p of predictions.data) {
      const list = riskByPatient.get(p.patient_id) ?? [];
      list.push(p.overall_risk);
      riskByPatient.set(p.patient_id, list);
    }
    const risks = patients.data.map((p) => mean(riskByPatient.get(p.id) ?? []));

    return FEATURES.map((f) => {
      const values = patients.data!.map((p) => (p[f.key] == null ? NaN : Number(p[f.key])));
      const pairs: { x: number; y: number }[] = [];
      values.forEach((v, i) => {
        const r = risks[i];
        if (!Number.isNaN(v) && Number.isFinite(v) && r != null && r > 0) {
          pairs.push({ x: v, y: r });
        }
      });
      const r = correlation(
        pairs.map((p) => p.x),
        pairs.map((p) => p.y),
      );
      return { ...f, r, abs: Math.abs(r), samples: pairs.length };
    }).sort((a, b) => b.abs - a.abs);
  }, [patients.data, predictions.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Explainable AI"
        description="Cohort-level feature attribution: how strongly each synthetic feature co-moves with stored risk scores. Correlation is not causation — this is descriptive, not clinical."
        icon={Brain}
      />
      <DisclaimerBanner />
      <ShapExplainer />
      <h2 className="font-display pt-4 text-xl font-semibold">Cohort-level feature associations</h2>

      {isLoading ? (
        <DashboardCard title="Feature attribution" description="Loading cohort">
          <LoadingSkeleton rows={4} />
        </DashboardCard>
      ) : isError ? (
        <DashboardCard title="Feature attribution" description="Could not load data">
          <ErrorState
            onRetry={() => {
              void patients.refetch();
              void predictions.refetch();
            }}
          />
        </DashboardCard>
      ) : ranking.length === 0 || ranking.every((r) => r.samples < 2) ? (
        <DashboardCard title="Feature attribution" description="Nothing to analyze">
          <EmptyState
            title="Not enough data"
            description="At least two patients with stored predictions are required."
          />
        </DashboardCard>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <DashboardCard
              title="Feature attribution ranking"
              description="Pearson correlation of each feature with mean stored risk"
            >
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ranking}
                    layout="vertical"
                    margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" domain={[-1, 1]} tick={{ fontSize: 11 }} stroke="currentColor" />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={90}
                      tick={{ fontSize: 11 }}
                      stroke="currentColor"
                    />
                    <Tooltip
                      formatter={(value) => [
                        typeof value === "number" ? value.toFixed(3) : value,
                        "correlation",
                      ]}
                      contentStyle={{
                        borderRadius: "0.75rem",
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--card))",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="r" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DashboardCard>

            <DashboardCard title="How to read this" description="Interpretation notes">
              <ul className="space-y-3">
                {ranking.map((f, i) => (
                  <li key={f.key} className="border-border/70 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {i + 1}. {f.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          f.r > 0.2
                            ? "bg-warning/15 text-warning"
                            : f.r < -0.2
                              ? "bg-success/15 text-success"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        r = {f.r.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{f.description}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {f.r > 0.2
                        ? "Higher values associate with higher stored risk in this cohort."
                        : f.r < -0.2
                          ? "Higher values associate with lower stored risk in this cohort."
                          : "Weak association with stored risk in this cohort."}{" "}
                      ({f.samples} records)
                    </p>
                  </li>
                ))}
              </ul>
            </DashboardCard>
          </div>

          <DashboardCard title="Method" description="What this page computes">
            <p className="text-muted-foreground text-xs leading-relaxed">
              For every patient, we average their stored overall risk scores, then compute the
              Pearson correlation between that average and each numeric cohort feature. A value
              near +1 means the feature rises with risk, near −1 it falls with risk, and near 0
              there is little linear relationship. This cohort is synthetic and small, so treat
              every number as illustrative only.
            </p>
          </DashboardCard>
        </>
      )}
    </div>
  );
}
