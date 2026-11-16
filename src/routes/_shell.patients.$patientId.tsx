import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, User } from "lucide-react";
import {
  Area,
  AreaChart,
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
import { RiskBadge } from "@/components/app/RiskBadge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logAudit } from "@/lib/audit";
import {
  normalizeRiskLevel,
  usePatient,
  usePatientMeasurements,
  usePatientPredictions,
} from "@/lib/patients";

export const Route = createFileRoute("/_shell/patients/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient profile — HealthRisk AI" },
      {
        name: "description",
        content:
          "Anonymized synthetic patient profile with risk summary, measurements and prediction history.",
      },
      { property: "og:title", content: "Patient profile — HealthRisk AI" },
      {
        property: "og:description",
        content: "Anonymized synthetic patient profile in the HealthRisk AI research workspace.",
      },
    ],
  }),
  component: PatientDetailPage,
  errorComponent: () => <ErrorState />,
  notFoundComponent: () => (
    <EmptyState title="Patient not found" description="This synthetic record no longer exists." />
  ),
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/60 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
      <p className="mt-0.5 font-medium capitalize">{value}</p>
    </div>
  );
}

function PatientDetailPage() {
  const { patientId } = Route.useParams();
  const patientQuery = usePatient(patientId);
  const measurementsQuery = usePatientMeasurements(patientId);
  const predictionsQuery = usePatientPredictions(patientId);
  const [metric, setMetric] = useState<string>("");

  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    void logAudit("patient.view_profile", { patient_id: patientId });
  }, [patientId]);

  const measurements = measurementsQuery.data ?? [];
  const metricTypes = useMemo(
    () => Array.from(new Set(measurements.map((m) => m.measurement_type))).sort(),
    [measurements],
  );
  const activeMetric = metric || metricTypes[0] || "";

  const series = useMemo(
    () =>
      measurements
        .filter((m) => m.measurement_type === activeMetric)
        .map((m) => ({ date: m.measurement_date, value: Number(m.value) })),
    [measurements, activeMetric],
  );

  const predictions = predictionsQuery.data ?? [];
  const latest = predictions[0];
  const diseases = latest?.disease_predictions ?? [];

  if (patientQuery.isLoading) return <LoadingSkeleton rows={6} />;
  if (patientQuery.isError)
    return <ErrorState onRetry={() => void patientQuery.refetch()} />;

  const patient = patientQuery.data;
  if (!patient)
    return (
      <EmptyState
        title="Patient not found"
        description="This synthetic record no longer exists."
        action={
          <Button variant="outline" asChild>
            <Link to="/patients">Back to patients</Link>
          </Button>
        }
      />
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={patient.patient_code}
          description="Patient profile and health metrics."
          icon={User}
        />
        <Button variant="outline" asChild>
          <Link to="/patients">
            <ArrowLeft className="size-4" /> Back to cohort
          </Link>
        </Button>
      </div>

      <DisclaimerBanner />

      <div className="grid gap-6 lg:grid-cols-3">
        <DashboardCard
          title="Patient overview"
          description="Baseline synthetic attributes"
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Age" value={String(patient.age)} />
            <Stat label="Gender" value={patient.gender} />
            <Stat label="Height" value={patient.height_cm ? `${patient.height_cm} cm` : "—"} />
            <Stat label="Weight" value={patient.weight_kg ? `${patient.weight_kg} kg` : "—"} />
            <Stat label="BMI" value={patient.bmi != null ? String(patient.bmi) : "—"} />
            <Stat label="Blood pressure" value={patient.blood_pressure ?? "—"} />
            <Stat label="Heart rate" value={patient.heart_rate != null ? `${patient.heart_rate} bpm` : "—"} />
            <Stat label="Glucose" value={patient.glucose != null ? `${patient.glucose} mg/dL` : "—"} />
            <Stat
              label="Cholesterol"
              value={patient.cholesterol != null ? `${patient.cholesterol} mg/dL` : "—"}
            />
            <Stat label="Smoking" value={patient.smoking_status ?? "—"} />
            <Stat label="Exercise" value={patient.exercise_level ?? "—"} />
            <Stat label="Family history" value={patient.family_history ? "Yes" : "No"} />
          </div>
        </DashboardCard>

        <DashboardCard title="Risk summary" description="Most recent stored estimate">
          {predictionsQuery.isLoading ? (
            <LoadingSkeleton rows={2} />
          ) : !latest ? (
            <EmptyState
              title="No stored risk estimate"
              description="No prediction has been recorded for this synthetic record."
            />
          ) : (
            <div className="space-y-3">
              <p className="text-3xl font-semibold">{Number(latest.overall_risk).toFixed(1)}%</p>
              <RiskBadge level={normalizeRiskLevel(latest.risk_level)} />
              <p className="text-muted-foreground text-xs">
                Model {latest.model_name} · {new Date(latest.prediction_date).toLocaleDateString()}
              </p>
            </div>
          )}
        </DashboardCard>
      </div>

      <DashboardCard
        title="Health measurements"
        description={`${measurements.length} recorded synthetic measurements`}
      >
        {measurementsQuery.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : measurementsQuery.isError ? (
          <ErrorState onRetry={() => void measurementsQuery.refetch()} />
        ) : measurements.length === 0 ? (
          <EmptyState
            title="No measurements recorded"
            description="This synthetic record has no linked measurements yet."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Value</th>
                  <th className="py-2 pr-4 font-medium">Unit</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {[...measurements]
                  .reverse()
                  .slice(0, 15)
                  .map((m) => (
                    <tr key={m.id} className="border-border/60 border-b last:border-0">
                      <td className="py-2 pr-4 capitalize">{m.measurement_type.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-4">{Number(m.value)}</td>
                      <td className="py-2 pr-4">{m.unit ?? "—"}</td>
                      <td className="text-muted-foreground py-2 pr-4">{m.measurement_date}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      <DashboardCard
        title="Historical trends"
        description="Longitudinal synthetic series for the selected measurement"
      >
        {metricTypes.length === 0 ? (
          <EmptyState title="Nothing to plot" description="No measurement series is available." />
        ) : (
          <div className="space-y-4">
            <div className="max-w-xs">
              <Select value={activeMetric} onValueChange={setMetric}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricTypes.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </DashboardCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashboardCard title="Disease risk" description="Condition scores from the latest run">
          {diseases.length === 0 ? (
            <EmptyState
              title="No condition scores"
              description="The latest run recorded no condition-level scores."
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={diseases.map((d) => ({
                    name: d.disease_name,
                    score: Number(d.risk_score),
                  }))}
                  margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="score" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Prediction history" description="All stored runs for this record">
          {predictions.length === 0 ? (
            <EmptyState title="No prediction history" description="No runs recorded yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Score</th>
                    <th className="py-2 pr-4 font-medium">Level</th>
                    <th className="py-2 pr-4 font-medium">Model</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p) => (
                    <tr key={p.id} className="border-border/60 border-b last:border-0">
                      <td className="py-2 pr-4">
                        {new Date(p.prediction_date).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">{Number(p.overall_risk).toFixed(1)}%</td>
                      <td className="py-2 pr-4">
                        <RiskBadge level={normalizeRiskLevel(p.risk_level)} />
                      </td>
                      <td className="text-muted-foreground py-2 pr-4">{p.model_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
