import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { DashboardCard } from "@/components/app/DashboardCard";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePatients } from "@/lib/patients";
import { explainPatientShap, type ExplainResponse } from "@/lib/shap.functions";
import { fetchExplanation, getMlApiUrl, MlBackendUnavailableError } from "@/services/predictionService";
import { cn } from "@/lib/utils";

const MODELS = ["Cardiovascular disease", "Type 2 diabetes"];
const POS = "var(--color-destructive)";
const NEG = "var(--color-success)";
const tooltipStyle = { borderRadius: "0.75rem", border: "1px solid var(--color-border)", background: "var(--color-card)", fontSize: "12px" };
const sign = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

type Result = ExplainResponse & { source: "backend" | "in-app" };

export function ShapExplainer() {
  const patients = usePatients();
  const explainFn = useServerFn(explainPatientShap);
  const [patientId, setPatientId] = useState("");
  const [model, setModel] = useState(MODELS[0]!);

  useEffect(() => {
    if (!patientId && patients.data?.[0]) setPatientId(patients.data[0].id);
  }, [patients.data, patientId]);

  const q = useQuery({
    queryKey: ["shap", patientId, model],
    enabled: !!patientId,
    queryFn: async (): Promise<Result> => {
      if (getMlApiUrl()) {
        try {
          const r = await fetchExplanation(patientId);
          return {
            ...r,
            base_value: 0,
            prediction: 0,
            method: "SHAP / LIME (FastAPI backend)",
            features: r.features.map((f) => ({
              feature: f.feature,
              value: String(f.value),
              impact: Number(f.impact),
              direction: f.impact >= 0 ? "increases" : "decreases",
            })),
            source: "backend",
          };
        } catch (e) {
          if (!(e instanceof MlBackendUnavailableError)) throw e;
        }
      }
      return { ...(await explainFn({ data: { patientId, model } })), source: "in-app" };
    },
  });

  const waterfall = useMemo(() => {
    if (!q.data) return [];
    let run = q.data.base_value;
    const rows: { name: string; range: [number, number]; impact: number; kind: string }[] = [
      { name: "Baseline", range: [0, run], impact: run, kind: "base" },
    ];
    for (const f of [...q.data.features].reverse()) {
      const next = run + f.impact;
      rows.push({ name: f.feature, range: [Math.min(run, next), Math.max(run, next)], impact: f.impact, kind: f.impact >= 0 ? "pos" : "neg" });
      run = next;
    }
    rows.push({ name: "Prediction", range: [0, run], impact: run, kind: "base" });
    return rows;
  }, [q.data]);

  const totalAbs = q.data?.features.reduce((a, f) => a + Math.abs(f.impact), 0) || 1;
  const pos = q.data?.features.filter((f) => f.impact > 0) ?? [];
  const neg = q.data?.features.filter((f) => f.impact < 0) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Why did the model make this prediction?</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Model explanation — not medical advice. Contributions are computed live for the selected record.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={patientId} onValueChange={setPatientId}>
          <SelectTrigger className="w-48" aria-label="Patient record"><SelectValue placeholder="Select record" /></SelectTrigger>
          <SelectContent>
            {(patients.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.patient_code}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="w-56" aria-label="Model"><SelectValue /></SelectTrigger>
          <SelectContent>{MODELS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {patients.isLoading || q.isLoading ? (
        <DashboardCard title="Explanation" description="Computing contributions"><LoadingSkeleton rows={4} /></DashboardCard>
      ) : q.isError ? (
        <DashboardCard title="Explanation" description="Could not explain this record">
          <ErrorState description={q.error instanceof Error ? q.error.message : "Please try again."} onRetry={() => void q.refetch()} />
        </DashboardCard>
      ) : !q.data ? (
        <DashboardCard title="Explanation" description="No record selected"><EmptyState title="Select a record" description="Choose a patient record to explain." /></DashboardCard>
      ) : (
        <>
          <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>Record: <b className="text-foreground">{q.data.patient_id}</b></span>
            <span>Model: <b className="text-foreground">{q.data.model_name}</b></span>
            <span>Method: <b className="text-foreground">{q.data.method}</b></span>
            {q.data.source === "in-app" && (
              <>
                <span>Baseline: <b className="text-foreground">{q.data.base_value}%</b></span>
                <span>Prediction: <b className="text-foreground">{q.data.prediction}%</b></span>
              </>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <DashboardCard title="SHAP values" description="Signed contribution to predicted risk (percentage points)">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={q.data.features} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" />
                    <YAxis type="category" dataKey="feature" width={130} tick={{ fontSize: 11 }} stroke="currentColor" />
                    <ReferenceLine x={0} stroke="currentColor" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [sign(Number(v)), "impact"]} />
                    <Bar dataKey="impact" radius={4}>
                      {q.data.features.map((f) => <Cell key={f.feature} fill={f.impact >= 0 ? POS : NEG} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DashboardCard>

            <DashboardCard title="Feature importance" description="Share of total absolute contribution">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={q.data.features.map((f) => ({ feature: f.feature, share: Math.round((Math.abs(f.impact) / totalAbs) * 1000) / 10 }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                    <XAxis type="number" unit="%" tick={{ fontSize: 11 }} stroke="currentColor" />
                    <YAxis type="category" dataKey="feature" width={130} tick={{ fontSize: 11 }} stroke="currentColor" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}%`, "importance"]} />
                    <Bar dataKey="share" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DashboardCard>
          </div>

          {q.data.source === "in-app" && (
            <DashboardCard title="Waterfall" description="From baseline risk to this record's prediction">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfall} margin={{ top: 8, right: 16, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" interval={0} stroke="currentColor" />
                    <YAxis unit="%" tick={{ fontSize: 11 }} stroke="currentColor" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(_v, _n, item) => {
                      const r = item.payload as { kind: string; impact: number };
                      return [r.kind === "base" ? `${r.impact.toFixed(1)}%` : sign(r.impact), "value"];
                    }} />
                    <Bar dataKey="range" radius={3}>
                      {waterfall.map((r) => <Cell key={r.name} fill={r.kind === "base" ? "var(--color-primary)" : r.kind === "pos" ? POS : NEG} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </DashboardCard>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {[{ title: "Positive contributors", list: pos, up: true }, { title: "Negative contributors", list: neg, up: false }].map((g) => (
              <DashboardCard key={g.title} title={g.title} description={g.up ? "Pushed the estimate higher" : "Pulled the estimate lower"}>
                {g.list.length === 0 ? (
                  <p className="text-muted-foreground text-sm">None for this record.</p>
                ) : (
                  <ul className="space-y-2">
                    {g.list.map((f) => (
                      <li key={f.feature} className="border-border/70 flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{f.feature}</p>
                          <p className="text-muted-foreground text-xs">Value: {f.value}</p>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-display text-base font-semibold", g.up ? "text-destructive" : "text-success")}>{sign(f.impact)}</p>
                          <p className="text-muted-foreground flex items-center justify-end gap-1 text-xs">
                            {g.up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                            {g.up ? "Increases Risk" : "Decreases Risk"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </DashboardCard>
            ))}
          </div>

          <div className="bg-muted/40 flex gap-3 rounded-xl p-4">
            <Info className="text-primary mt-0.5 size-4 shrink-0" />
            <p className="text-muted-foreground text-sm">
              Positive values indicate features that contributed toward a higher predicted risk. Negative values indicate features that contributed toward a lower predicted risk.
              <span className="text-foreground mt-1 block font-medium">This is a model explanation, not medical advice.</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
