import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Play } from "lucide-react";
import { toast } from "sonner";
import { DashboardCard } from "@/components/app/DashboardCard";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { RiskBadge } from "@/components/app/RiskBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { usePatients } from "@/lib/patients";
import {
  useRescoreCohort,
  useRiskPreview,
  useRunPrediction,
  type RiskEstimate,
} from "@/lib/risk-model";
import { useAuth } from "@/lib/auth";
import { ExplainPanel } from "@/components/app/ExplainPanel";
import { MlPredictionForm } from "@/components/app/MlPredictionForm";
import { getActiveUser, getUserPredictions, saveUserPrediction } from "@/lib/user-database";

export const Route = createFileRoute("/_shell/prediction")({
  head: () => ({
    meta: [
      { title: "Risk Prediction — HealthRisk AI" },
      {
        name: "description",
        content:
          "Browse stored baseline risk estimates computed on synthetic cohorts in HealthRisk AI.",
      },
      { property: "og:title", content: "Risk Prediction — HealthRisk AI" },
      {
        property: "og:description",
        content: "Stored baseline risk estimates for synthetic research cohorts.",
      },
    ],
  }),
  component: PredictionPage,
});

type PredictionRow = {
  id: string;
  overall_risk: number;
  risk_level: string;
  model_name: string;
  prediction_date: string;
  patients: { patient_code: string; age: number; gender: string } | null;
};

function usePredictions() {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["risk-predictions", activeUser?.id],
    queryFn: async (): Promise<PredictionRow[]> => {
      try {
        const local = getUserPredictions(activeUser?.id);
        if (local && local.length > 0) return local as unknown as PredictionRow[];
        const { data, error } = await supabase
          .from("risk_predictions")
          .select(
            "id, overall_risk, risk_level, model_name, prediction_date, patients(patient_code, age, gender)",
          )
          .order("overall_risk", { ascending: false });
        if (!error && data && data.length > 0) return (data ?? []) as unknown as PredictionRow[];
      } catch {
        // fallback
      }
      return getUserPredictions(activeUser?.id) as unknown as PredictionRow[];
    },
  });
}

function PredictionPage() {
  const { data, isLoading, isError, refetch } = usePredictions();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((r) => r.patients?.patient_code.toLowerCase().includes(q));
  }, [data, query]);

  const summary = useMemo(() => {
    if (!data || data.length === 0) return null;
    const avg = data.reduce((sum, r) => sum + Number(r.overall_risk), 0) / data.length;
    const counts = data.reduce<Record<string, number>>((acc, r) => {
      const key = r.risk_level.toLowerCase();
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return { avg, counts };
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk Prediction"
        description="Run and review risk estimates for the synthetic cohort. Scores are computed server-side from published clinical equations (Framingham, FINDRISC, NCEP ATP III, COPD-PS) — research use only, never diagnosis."
        icon={Activity}
      />

      <DisclaimerBanner />

      <MlPredictionForm />

      <RunEstimatePanel />


      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard title="Records scored" description="Synthetic predictions stored">
            <p className="font-display text-2xl font-semibold">{data?.length ?? 0}</p>
          </DashboardCard>
          <DashboardCard title="Average risk" description="Across the cohort">
            <p className="font-display text-2xl font-semibold">{summary.avg.toFixed(1)}</p>
          </DashboardCard>
          <DashboardCard title="High risk" description="Level flagged as high">
            <p className="font-display text-2xl font-semibold">{summary.counts["high"] ?? 0}</p>
          </DashboardCard>
          <DashboardCard title="Low risk" description="Level flagged as low">
            <p className="font-display text-2xl font-semibold">{summary.counts["low"] ?? 0}</p>
          </DashboardCard>
        </div>
      )}

      <DashboardCard
        title="Prediction runs"
        description="Baseline placeholder model output on synthetic records"
      >
        <div className="mb-4 max-w-xs">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by patient code"
            aria-label="Filter predictions by patient code"
          />
        </div>

        {isLoading ? (
          <LoadingSkeleton rows={5} />
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No predictions to show"
            description="No stored risk estimates match the current filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Patient</th>
                  <th className="py-2 pr-4 font-medium">Age</th>
                  <th className="py-2 pr-4 font-medium">Gender</th>
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-border/60 border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{row.patients?.patient_code ?? "—"}</td>
                    <td className="py-2.5 pr-4">{row.patients?.age ?? "—"}</td>
                    <td className="py-2.5 pr-4 capitalize">{row.patients?.gender ?? "—"}</td>
                    <td className="text-muted-foreground py-2.5 pr-4 text-xs">{row.model_name}</td>
                    <td className="text-muted-foreground py-2.5 pr-4 text-xs">
                      {new Date(row.prediction_date).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 pr-4">
                      <RiskBadge
                        level={row.risk_level.toLowerCase() as "low" | "moderate" | "high"}
                        score={Number(row.overall_risk)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}

function RunEstimatePanel() {
  const { canWriteResearch, user } = useAuth();
  const { data: patients, isLoading } = usePatients();
  const queryClient = useQueryClient();
  const runPrediction = useRunPrediction();
  const rescore = useRescoreCohort();
  const [patientId, setPatientId] = useState("");
  const [result, setResult] = useState<RiskEstimate | null>(null);
  const [running, setRunning] = useState(false);
  const { data: preview, isFetching: previewing } = useRiskPreview(patientId);

  const selected = patients?.find((p) => p.id === patientId) ?? null;

  const onRun = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const { computeClinicalRisk } = await import("@/lib/clinical-risk.server");
      const estimate = computeClinicalRisk(selected);
      setResult(estimate);

      saveUserPrediction({
        patientId: selected.id,
        patientName: selected.patient_code,
        overallRisk: estimate.overall,
        riskLevel: estimate.level,
        modelName: estimate.modelName,
        diseases: estimate.diseases.map((d) => ({
          disease_name: d.disease_name,
          risk_score: d.risk_score,
        })),
        userId: user?.id,
      });

      void queryClient.invalidateQueries({ queryKey: ["risk-predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["patient-latest-risk"] });
      void queryClient.invalidateQueries({ queryKey: ["cohort-predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["cohort-diseases"] });
      void queryClient.invalidateQueries({ queryKey: ["disease-predictions"] });

      toast.success(`Clinical estimate saved for ${selected.patient_code}`);
    } catch {
      toast.error("Could not save the estimate.");
    } finally {
      setRunning(false);
    }
  };

  const onRescore = async () => {
    try {
      const { computeClinicalRisk } = await import("@/lib/clinical-risk.server");
      const cohort = patients ?? [];
      for (const p of cohort) {
        const est = computeClinicalRisk(p);
        saveUserPrediction({
          patientId: p.id,
          patientName: p.patient_code,
          overallRisk: est.overall,
          riskLevel: est.level,
          modelName: est.modelName,
          diseases: est.diseases.map((d) => ({
            disease_name: d.disease_name,
            risk_score: d.risk_score,
          })),
          userId: user?.id,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["risk-predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["patient-latest-risk"] });
      void queryClient.invalidateQueries({ queryKey: ["cohort-predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["cohort-diseases"] });
      toast.success(`Re-scored ${cohort.length} records with the clinical model`);
    } catch {
      toast.error("Could not re-score the cohort.");
    }
  };

  const shown = result ?? preview ?? null;

  return (
    <DashboardCard
      title="Run a clinical estimate"
      description="Scores come from published instruments: Framingham general CVD, FINDRISC, Framingham hypertension progression, NCEP ATP III and the COPD Population Screener"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-72">
          <Select value={patientId} onValueChange={(v) => { setPatientId(v); setResult(null); }}>
            <SelectTrigger aria-label="Select a synthetic patient record">
              <SelectValue placeholder={isLoading ? "Loading records…" : "Select a patient record"} />
            </SelectTrigger>
            <SelectContent>
              {(patients ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.patient_code} · {p.age}y · {p.gender}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => void onRun()}
          disabled={!selected || running || !canWriteResearch}
        >
          <Play className="size-4" />
          {running ? "Scoring…" : "Run estimate"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void onRescore()}
          disabled={rescore.isPending || !canWriteResearch}
        >
          {rescore.isPending ? "Re-scoring…" : "Re-score all records"}
        </Button>
        {!canWriteResearch && (
          <p className="text-muted-foreground text-xs">
            Your role can view estimates but not save new ones.
          </p>
        )}
      </div>

      {previewing && !shown && <p className="text-muted-foreground mt-4 text-sm">Computing…</p>}

      {shown && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-display text-3xl font-semibold">{shown.overall}%</span>
              <RiskBadge level={shown.level} />
              {!result && <span className="text-muted-foreground text-xs">Preview — not saved</span>}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Highest published probability across the scored conditions · {shown.modelName}
            </p>
            <p className="text-muted-foreground mt-3 text-xs font-semibold tracking-widest uppercase">
              Inputs used
            </p>
            <ul className="mt-2 space-y-1.5">
              {shown.contributions.map((c) => (
                <li key={c.factor} className="flex items-center justify-between gap-4 text-sm">
                  <span>{c.factor}</span>
                  <span className="text-muted-foreground">{c.detail}</span>
                </li>
              ))}
            </ul>
            {shown.missingInputs.length > 0 && (
              <p className="text-muted-foreground mt-3 text-xs">
                Not in this record: {shown.missingInputs.join(", ")}.
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
              Condition-level estimates
            </p>
            <ul className="mt-2 space-y-3">
              {shown.diseases.map((d) => (
                <li key={d.disease_name}>
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {d.disease_name}
                      {!d.isProbability && (
                        <span className="text-muted-foreground"> · index</span>
                      )}
                    </span>
                    <span className="font-medium">{d.risk_score}%</span>
                  </div>
                  <div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
                    <div className="bg-primary h-full rounded-full" style={{ width: `${d.risk_score}%` }} />
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">{d.source}</p>
                  <p className="text-muted-foreground text-xs">{d.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {shown && selected && <ExplainPanel key={selected.id} patientId={selected.id} />}
    </DashboardCard>
  );
}
