import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList, Download } from "lucide-react";
import { toast } from "sonner";
import { DashboardCard } from "@/components/app/DashboardCard";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { Button } from "@/components/ui/button";
import { logAudit } from "@/lib/audit";
import { mean, useCohortPatients, useCohortPredictions } from "@/lib/cohort";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/reports")({
  head: () => ({
    meta: [
      { title: "Reports — HealthRisk AI" },
      { name: "description", content: "Export cohort summaries from the synthetic research dataset." },
      { property: "og:title", content: "Reports — HealthRisk AI" },
      { property: "og:description", content: "Export cohort summaries from the synthetic research dataset." },
    ],
  }),
  component: ReportsPage,
});

function csvEscape(value: string | number) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const lines = [header, ...rows].map((r) => r.map(csvEscape).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const patients = useCohortPatients();
  const predictions = useCohortPredictions();
  const [exporting, setExporting] = useState<string | null>(null);

  const isLoading = patients.isLoading || predictions.isLoading;
  const isError = patients.isError || predictions.isError;

  const summary = useMemo(() => {
    if (!patients.data || !predictions.data || patients.data.length === 0) return null;
    const ps = patients.data;
    const nums = (sel: (p: (typeof ps)[number]) => number | null) =>
      ps.map(sel).filter((v): v is number => v != null);
    return {
      patients: ps.length,
      avgAge: mean(ps.map((p) => p.age)),
      avgBmi: mean(nums((p) => p.bmi)),
      avgGlucose: mean(nums((p) => p.glucose)),
      avgCholesterol: mean(nums((p) => p.cholesterol)),
      smokers: ps.filter((p) => p.smoking_status && p.smoking_status !== "never").length,
      familyHistory: ps.filter((p) => p.family_history).length,
      predictions: predictions.data.length,
      avgRisk: mean(predictions.data.map((r) => r.overall_risk)),
      highRisk: predictions.data.filter((r) => r.risk_level === "high").length,
    };
  }, [patients.data, predictions.data]);

  const doExport = async (kind: "patients" | "predictions") => {
    setExporting(kind);
    try {
      if (kind === "patients" && patients.data) {
        downloadCsv(
          "healthrisk-cohort-patients.csv",
          ["patient_code", "age", "gender", "bmi", "heart_rate", "glucose", "cholesterol", "smoking_status", "exercise_level", "family_history"],
          patients.data.map((p) => [
            p.patient_code,
            p.age,
            p.gender,
            p.bmi ?? "",
            p.heart_rate ?? "",
            p.glucose ?? "",
            p.cholesterol ?? "",
            p.smoking_status ?? "",
            p.exercise_level ?? "",
            p.family_history ? "yes" : "no",
          ]),
        );
      } else if (kind === "predictions" && predictions.data) {
        const codeById = new Map((patients.data ?? []).map((p) => [p.id, p.patient_code]));
        downloadCsv(
          "healthrisk-risk-predictions.csv",
          ["patient_code", "overall_risk", "risk_level", "model_name", "prediction_date"],
          predictions.data.map((r) => [
            codeById.get(r.patient_id) ?? r.patient_id,
            r.overall_risk,
            r.risk_level,
            r.model_name,
            r.prediction_date,
          ]),
        );
      }
      await logAudit("reports.export_csv", { kind });
      toast.success("CSV downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Review the synthetic cohort summary and export it as CSV for further analysis."
        icon={ClipboardList}
      />
      <DisclaimerBanner />

      {isLoading ? (
        <DashboardCard title="Cohort summary" description="Loading data">
          <LoadingSkeleton rows={4} />
        </DashboardCard>
      ) : isError ? (
        <DashboardCard title="Cohort summary" description="Could not load data">
          <ErrorState
            onRetry={() => {
              void patients.refetch();
              void predictions.refetch();
            }}
          />
        </DashboardCard>
      ) : !summary ? (
        <DashboardCard title="Cohort summary" description="Nothing recorded">
          <EmptyState title="No data to report" description="Synthetic cohort data will appear here." />
        </DashboardCard>
      ) : (
        <>
          <DashboardCard title="Cohort summary" description="Live aggregates over the synthetic dataset">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Patients", value: summary.patients },
                { label: "Avg age", value: summary.avgAge.toFixed(1) },
                { label: "Avg BMI", value: summary.avgBmi.toFixed(1) },
                { label: "Avg glucose", value: summary.avgGlucose.toFixed(0) },
                { label: "Avg cholesterol", value: summary.avgCholesterol.toFixed(0) },
                { label: "Smokers (past/current)", value: summary.smokers },
                { label: "Family history", value: summary.familyHistory },
                { label: "Predictions", value: summary.predictions },
                { label: "Avg overall risk", value: summary.avgRisk.toFixed(2) },
                { label: "High-risk records", value: summary.highRisk },
              ].map((s) => (
                <div key={s.label} className="bg-muted/40 rounded-lg p-3">
                  <dt className="text-muted-foreground text-[11px]">{s.label}</dt>
                  <dd className="font-display mt-1 text-lg font-semibold">{s.value}</dd>
                </div>
              ))}
            </dl>
          </DashboardCard>

          <DashboardCard title="Exports" description="CSV downloads of the synthetic dataset">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    kind: "patients",
                    title: "Cohort patients",
                    desc: `${summary.patients} synthetic patient records with demographics and vitals.`,
                  },
                  {
                    kind: "predictions",
                    title: "Risk predictions",
                    desc: `${summary.predictions} stored baseline scores with risk levels.`,
                  },
                ] as const
              ).map((e) => (
                <div
                  key={e.kind}
                  className="border-border/70 flex items-start justify-between gap-3 rounded-lg border p-4"
                >
                  <div>
                    <h4 className="text-sm font-semibold">{e.title}</h4>
                    <p className="text-muted-foreground mt-1 text-xs">{e.desc}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exporting !== null}
                    onClick={() => void doExport(e.kind)}
                    className={cn(exporting === e.kind && "opacity-70")}
                  >
                    <Download className="size-3.5" />
                    {exporting === e.kind ? "Exporting…" : "CSV"}
                  </Button>
                </div>
              ))}
            </div>
          </DashboardCard>
        </>
      )}
    </div>
  );
}
