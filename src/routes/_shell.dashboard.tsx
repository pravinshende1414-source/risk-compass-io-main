import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Brain,
  HeartPulse,
  LayoutDashboard,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardCard, StatCard } from "@/components/app/DashboardCard";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { RiskBadge, type RiskLevel } from "@/components/app/RiskBadge";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/States";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCohortDiseases,
  useCohortPatients,
  useCohortPredictions,
  mean,
  type PatientRow,
  type PredictionRow,
} from "@/lib/cohort";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_shell/dashboard")({
  head: () => ({
    meta: [
      { title: "Analytics Dashboard — HealthRisk AI" },
      {
        name: "description",
        content:
          "Interactive analytics dashboard over the HealthRisk AI synthetic research cohort: risk KPIs, distribution charts and recent patient records.",
      },
      { property: "og:title", content: "Analytics Dashboard — HealthRisk AI" },
      {
        property: "og:description",
        content:
          "Risk KPIs, distribution charts and recent records for the synthetic research cohort.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--color-popover-foreground)",
} as const;

function normalizeLevel(level: string): RiskLevel {
  const l = level.toLowerCase();
  if (l === "low") return "low";
  if (l === "moderate" || l === "medium") return "moderate";
  if (l === "critical") return "critical";
  if (l === "high") return "high";
  return "unknown";
}

function systolic(bp: string | null) {
  if (!bp) return null;
  const n = Number(bp.split("/")[0]);
  return Number.isFinite(n) ? n : null;
}

function topRiskFactor(p: PatientRow) {
  const sys = systolic(p.blood_pressure);
  if (p.glucose != null && Number(p.glucose) >= 126) return "Elevated glucose";
  if (sys != null && sys >= 140) return "High blood pressure";
  if (p.cholesterol != null && Number(p.cholesterol) >= 240) return "High cholesterol";
  if (p.bmi != null && Number(p.bmi) >= 30) return "Elevated BMI";
  if ((p.smoking_status ?? "").toLowerCase() === "current") return "Smoking";
  if (p.exercise_level && p.exercise_level.toLowerCase() === "low") return "Low activity";
  if (p.family_history) return "Family history";
  if (p.age >= 60) return "Age";
  return "No dominant factor";
}

function ageBand(age: number) {
  if (age < 30) return "18–29";
  if (age < 40) return "30–39";
  if (age < 50) return "40–49";
  if (age < 60) return "50–59";
  if (age < 70) return "60–69";
  return "70+";
}

function bucket(value: number, edges: number[], labels: string[]) {
  for (let i = 0; i < edges.length; i += 1) {
    if (value < edges[i]!) return labels[i]!;
  }
  return labels[labels.length - 1]!;
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

function DashboardPage() {
  const navigate = useNavigate();
  const patientsQuery = useCohortPatients();
  const predictionsQuery = useCohortPredictions();
  const diseasesQuery = useCohortDiseases();

  const [dateRange, setDateRange] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [genderFilter, setGenderFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [diseaseFilter, setDiseaseFilter] = useState("all");

  const isLoading =
    patientsQuery.isLoading || predictionsQuery.isLoading || diseasesQuery.isLoading;
  const isError = patientsQuery.isError || predictionsQuery.isError || diseasesQuery.isError;

  const patients = patientsQuery.data ?? [];
  const predictions = predictionsQuery.data ?? [];
  const diseases = diseasesQuery.data ?? [];

  const diseaseNames = useMemo(
    () => Array.from(new Set(diseases.map((d) => d.disease_name))).sort(),
    [diseases],
  );

  /** Latest stored prediction per patient, restricted by the active date range. */
  const filtered = useMemo(() => {
    const cutoff =
      dateRange === "all" ? null : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;

    const inRange = predictions.filter(
      (p) => cutoff === null || new Date(p.prediction_date).getTime() >= cutoff,
    );

    const latest = new Map<string, PredictionRow>();
    for (const p of inRange) {
      const prev = latest.get(p.patient_id);
      if (!prev || new Date(p.prediction_date) > new Date(prev.prediction_date)) {
        latest.set(p.patient_id, p);
      }
    }

    const diseaseByPrediction = new Set(
      diseases.filter((d) => d.disease_name === diseaseFilter).map((d) => d.prediction_id),
    );

    const rows = patients
      .map((patient) => ({ patient, prediction: latest.get(patient.id) ?? null }))
      .filter(({ patient, prediction }) => {
        if (ageFilter !== "all" && ageBand(patient.age) !== ageFilter) return false;
        if (genderFilter !== "all" && patient.gender.toLowerCase() !== genderFilter) return false;
        if (levelFilter !== "all") {
          if (!prediction) return false;
          if (normalizeLevel(prediction.risk_level) !== levelFilter) return false;
        }
        if (diseaseFilter !== "all") {
          if (!prediction) return false;
          if (!diseaseByPrediction.has(prediction.id)) return false;
        }
        return true;
      });

    return { rows, inRange };
  }, [patients, predictions, diseases, dateRange, ageFilter, genderFilter, levelFilter, diseaseFilter]);

  const rows = filtered.rows;
  const scored = rows.filter((r) => r.prediction);

  const kpis = useMemo(() => {
    const levels = countBy(scored, (r) => normalizeLevel(r.prediction!.risk_level));
    return {
      total: rows.length,
      high: (levels["high"] ?? 0) + (levels["critical"] ?? 0),
      medium: levels["moderate"] ?? 0,
      low: levels["low"] ?? 0,
      avg: mean(scored.map((r) => Number(r.prediction!.overall_risk))),
    };
  }, [rows, scored]);

  const riskDistribution = useMemo(
    () =>
      [
        { name: "Low", value: kpis.low },
        { name: "Medium", value: kpis.medium },
        { name: "High", value: kpis.high },
      ].filter((d) => d.value > 0),
    [kpis],
  );

  const visiblePredictionIds = useMemo(
    () => new Set(scored.map((r) => r.prediction!.id)),
    [scored],
  );

  const diseaseDistribution = useMemo(() => {
    const grouped = new Map<string, number[]>();
    for (const d of diseases) {
      if (!visiblePredictionIds.has(d.prediction_id)) continue;
      const list = grouped.get(d.disease_name) ?? [];
      list.push(Number(d.risk_score));
      grouped.set(d.disease_name, list);
    }
    return Array.from(grouped.entries())
      .map(([name, values]) => ({ name, score: Number(mean(values).toFixed(1)) }))
      .sort((a, b) => b.score - a.score);
  }, [diseases, visiblePredictionIds]);

  const riskTrend = useMemo(() => {
    const byMonth = new Map<string, number[]>();
    const patientIds = new Set(rows.map((r) => r.patient.id));
    for (const p of filtered.inRange) {
      if (!patientIds.has(p.patient_id)) continue;
      const d = new Date(p.prediction_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const list = byMonth.get(key) ?? [];
      list.push(Number(p.overall_risk));
      byMonth.set(key, list);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        month,
        risk: Number(mean(values).toFixed(1)),
        runs: values.length,
      }));
  }, [filtered.inRange, rows]);

  const toSeries = (record: Record<string, number>, order?: string[]) => {
    const keys = order ? order.filter((k) => record[k] !== undefined) : Object.keys(record).sort();
    return keys.map((name) => ({ name, count: record[name]! }));
  };

  const ageDistribution = useMemo(
    () =>
      toSeries(countBy(rows, (r) => ageBand(r.patient.age)), [
        "18–29",
        "30–39",
        "40–49",
        "50–59",
        "60–69",
        "70+",
      ]),
    [rows],
  );

  const bmiDistribution = useMemo(
    () =>
      toSeries(
        countBy(
          rows.filter((r) => r.patient.bmi != null),
          (r) =>
            bucket(Number(r.patient.bmi), [18.5, 25, 30], [
              "Under 18.5",
              "18.5–24.9",
              "25–29.9",
              "30+",
            ]),
        ),
        ["Under 18.5", "18.5–24.9", "25–29.9", "30+"],
      ),
    [rows],
  );

  const glucoseDistribution = useMemo(
    () =>
      toSeries(
        countBy(
          rows.filter((r) => r.patient.glucose != null),
          (r) =>
            bucket(Number(r.patient.glucose), [100, 126], ["< 100", "100–125", "126+"]),
        ),
        ["< 100", "100–125", "126+"],
      ),
    [rows],
  );

  const bpDistribution = useMemo(
    () =>
      toSeries(
        countBy(
          rows.filter((r) => systolic(r.patient.blood_pressure) != null),
          (r) =>
            bucket(systolic(r.patient.blood_pressure)!, [120, 130, 140], [
              "< 120",
              "120–129",
              "130–139",
              "140+",
            ]),
        ),
        ["< 120", "120–129", "130–139", "140+"],
      ),
    [rows],
  );

  const riskByGender = useMemo(() => {
    const grouped = new Map<string, number[]>();
    for (const r of scored) {
      const key = r.patient.gender;
      const list = grouped.get(key) ?? [];
      list.push(Number(r.prediction!.overall_risk));
      grouped.set(key, list);
    }
    return Array.from(grouped.entries()).map(([name, values]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      risk: Number(mean(values).toFixed(1)),
    }));
  }, [scored]);

  const lifestyleVsRisk = useMemo(() => {
    const groups: Array<[string, (r: (typeof scored)[number]) => boolean]> = [
      ["Smoker", (r) => (r.patient.smoking_status ?? "").toLowerCase() === "current"],
      ["Non-smoker", (r) => (r.patient.smoking_status ?? "").toLowerCase() !== "current"],
      ["Low activity", (r) => (r.patient.exercise_level ?? "").toLowerCase() === "low"],
      ["Active", (r) => ["moderate", "high"].includes((r.patient.exercise_level ?? "").toLowerCase())],
      ["Family history", (r) => r.patient.family_history],
    ];
    return groups
      .map(([name, match]) => {
        const values = scored.filter(match).map((r) => Number(r.prediction!.overall_risk));
        return { name, risk: Number(mean(values).toFixed(1)), n: values.length };
      })
      .filter((g) => g.n > 0);
  }, [scored]);

  const recent = useMemo(
    () =>
      [...rows]
        .sort((a, b) => {
          const at = a.prediction ? new Date(a.prediction.prediction_date).getTime() : 0;
          const bt = b.prediction ? new Date(b.prediction.prediction_date).getTime() : 0;
          return bt - at;
        })
        .slice(0, 10),
    [rows],
  );

  const resetFilters = () => {
    setDateRange("all");
    setAgeFilter("all");
    setGenderFilter("all");
    setLevelFilter("all");
    setDiseaseFilter("all");
  };

  const retry = () => {
    void patientsQuery.refetch();
    void predictionsQuery.refetch();
    void diseasesQuery.refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Research analytics dashboard"
          description="Descriptive analytics across the synthetic research cohort — risk KPIs, distributions and recent records."
          icon={LayoutDashboard}
        />
        <span className="border-warning/40 bg-warning/10 text-warning inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide uppercase">
          <span className="bg-warning size-1.5 rounded-full" />
          Demo mode — synthetic research data
        </span>
      </div>

      <DisclaimerBanner />

      <DashboardCard title="Filters" description="Applies to every card, chart and table below">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <FilterSelect
            label="Date range"
            value={dateRange}
            onChange={setDateRange}
            options={[
              { value: "all", label: "All time" },
              { value: "30", label: "Last 30 days" },
              { value: "90", label: "Last 90 days" },
              { value: "365", label: "Last 12 months" },
            ]}
          />
          <FilterSelect
            label="Age band"
            value={ageFilter}
            onChange={setAgeFilter}
            options={[
              { value: "all", label: "All ages" },
              ...["18–29", "30–39", "40–49", "50–59", "60–69", "70+"].map((v) => ({
                value: v,
                label: v,
              })),
            ]}
          />
          <FilterSelect
            label="Gender"
            value={genderFilter}
            onChange={setGenderFilter}
            options={[
              { value: "all", label: "All genders" },
              ...Array.from(new Set(patients.map((p) => p.gender.toLowerCase()))).map((g) => ({
                value: g,
                label: g.charAt(0).toUpperCase() + g.slice(1),
              })),
            ]}
          />
          <FilterSelect
            label="Risk level"
            value={levelFilter}
            onChange={setLevelFilter}
            options={[
              { value: "all", label: "All levels" },
              { value: "low", label: "Low" },
              { value: "moderate", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
          <FilterSelect
            label="Disease"
            value={diseaseFilter}
            onChange={setDiseaseFilter}
            options={[
              { value: "all", label: "All conditions" },
              ...diseaseNames.map((d) => ({ value: d, label: d })),
            ]}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
      </DashboardCard>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : isError ? (
        <ErrorState
          title="Couldn't load cohort analytics"
          description="The synthetic cohort data failed to load. Please try again."
          onRetry={retry}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No records match these filters"
          description="Widen the date range or clear a filter to see cohort analytics again."
          action={
            <Button size="sm" variant="outline" onClick={resetFilters}>
              Reset filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total patients" value={String(kpis.total)} delta="In current selection" icon={Users} />
            <StatCard label="High risk" value={String(kpis.high)} delta="Latest stored score" icon={HeartPulse} tone="warning" />
            <StatCard label="Medium risk" value={String(kpis.medium)} delta="Latest stored score" icon={Activity} tone="accent" />
            <StatCard label="Low risk" value={String(kpis.low)} delta="Latest stored score" icon={Brain} tone="success" />
            <StatCard
              label="Average risk score"
              value={scored.length ? kpis.avg.toFixed(1) : "—"}
              delta={`${scored.length} scored records`}
              icon={BarChart3}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardCard title="Risk distribution" description="Patients by latest stored risk level">
              <ChartFrame empty={riskDistribution.length === 0}>
                <PieChart>
                  <Pie data={riskDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {riskDistribution.map((entry, i) => (
                      <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={24} iconType="circle" />
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ChartFrame>
            </DashboardCard>

            <DashboardCard title="Disease risk distribution" description="Average synthetic score per condition">
              <ChartFrame empty={diseaseDistribution.length === 0}>
                <BarChart data={diseaseDistribution} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-15} textAnchor="end" height={50} stroke="var(--color-muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="score" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartFrame>
            </DashboardCard>

            <DashboardCard title="Risk trend" description="Average stored risk score by month" className="lg:col-span-2">
              <ChartFrame empty={riskTrend.length === 0}>
                <AreaChart data={riskTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillRiskTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="risk" stroke="var(--color-chart-1)" fill="url(#fillRiskTrend)" strokeWidth={2} />
                </AreaChart>
              </ChartFrame>
            </DashboardCard>

            <DistributionCard title="Age distribution" description="Patients per age band" data={ageDistribution} color="var(--color-chart-1)" />
            <DistributionCard title="BMI distribution" description="Patients per BMI band" data={bmiDistribution} color="var(--color-chart-3)" />
            <DistributionCard title="Glucose distribution" description="Fasting glucose bands (mg/dL)" data={glucoseDistribution} color="var(--color-chart-4)" />
            <DistributionCard title="Blood pressure distribution" description="Systolic bands (mmHg)" data={bpDistribution} color="var(--color-chart-5)" />

            <DashboardCard title="Risk by gender" description="Average stored risk score">
              <ChartFrame empty={riskByGender.length === 0}>
                <BarChart data={riskByGender} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="risk" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartFrame>
            </DashboardCard>

            <DashboardCard title="Lifestyle vs risk" description="Average stored risk score by lifestyle segment">
              <ChartFrame empty={lifestyleVsRisk.length === 0}>
                <LineChart data={lifestyleVsRisk} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-15} textAnchor="end" height={50} stroke="var(--color-muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="risk" stroke="var(--color-chart-3)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartFrame>
            </DashboardCard>
          </div>

          <DashboardCard
            title="Recent patients"
            description="Most recently scored synthetic records in the current selection"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="text-muted-foreground border-border border-b text-left text-xs uppercase">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Patient Name</th>
                    <th className="py-2 pr-4 font-medium">Age</th>
                    <th className="py-2 pr-4 font-medium">Risk score</th>
                    <th className="py-2 pr-4 font-medium">Risk level</th>
                    <th className="py-2 pr-4 font-medium">Top risk factor</th>
                    <th className="py-2 pr-4 font-medium">Last updated</th>
                    <th className="py-2 pr-4 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(({ patient, prediction }) => (
                    <tr key={patient.id} className="border-border/60 hover:bg-muted/40 border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{patient.patient_code}</td>
                      <td className="py-2.5 pr-4">{patient.age}</td>
                      <td className="py-2.5 pr-4">
                        {prediction ? Number(prediction.overall_risk).toFixed(1) : "—"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <RiskBadge level={prediction ? normalizeLevel(prediction.risk_level) : "unknown"} />
                      </td>
                      <td className="text-muted-foreground py-2.5 pr-4 text-xs">{topRiskFactor(patient)}</td>
                      <td className="text-muted-foreground py-2.5 pr-4 text-xs">
                        {prediction
                          ? new Date(prediction.prediction_date).toLocaleDateString()
                          : "Not scored"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void logAudit("dashboard.patient_view", { patient_id: patient.id });
                              void navigate({ to: "/patients" });
                            }}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void logAudit("dashboard.patient_analyze", { patient_id: patient.id });
                              void navigate({ to: "/explainable-ai" });
                            }}
                          >
                            Analyze
                          </Button>
                        </div>
                      </td>
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1.5 block text-xs font-medium">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function ChartFrame({ empty, children }: { empty: boolean; children: React.ReactElement }) {
  if (empty) {
    return (
      <EmptyState
        title="No data for this chart"
        description="No records in the current selection contain the values this chart needs."
      />
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function DistributionCard({
  title,
  description,
  data,
  color,
}: {
  title: string;
  description: string;
  data: Array<{ name: string; count: number }>;
  color: string;
}) {
  return (
    <DashboardCard title={title} description={description}>
      <ChartFrame empty={data.length === 0}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="var(--color-muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartFrame>
    </DashboardCard>
  );
}
