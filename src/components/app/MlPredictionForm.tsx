import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Server } from "lucide-react";
import { toast } from "sonner";
import { DashboardCard } from "@/components/app/DashboardCard";
import { RiskBadge } from "@/components/app/RiskBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { predictInApp } from "@/lib/risk.functions";
import { useAuth } from "@/lib/auth";
import { usePatients } from "@/lib/patients";
import { saveUserPrediction } from "@/lib/user-database";
import {
  MlBackendUnavailableError,
  checkMlBackend,
  getMlApiUrl,
  predictRisk,
  type PredictionRequest,
  type PredictionResponse,
} from "@/services/predictionService";

const STEPS = ["Basic information", "Vitals", "Lifestyle", "History"] as const;
const CONDITIONS = ["Hypertension", "Diabetes", "Heart disease", "Stroke", "Asthma / COPD", "Kidney disease"];

type Form = {
  patientId: string;
  patientName: string;
  age: string; gender: string; height: string; weight: string; bmi: string;
  bp: string; heartRate: string; glucose: string; cholesterol: string;
  exercise: string; smoking: string; alcohol: string; sleep: string;
  familyHistory: boolean; conditions: string[];
};

const initial: Form = {
  patientId: "",
  patientName: "",
  age: "", gender: "", height: "", weight: "", bmi: "",
  bp: "", heartRate: "", glucose: "", cholesterol: "",
  exercise: "", smoking: "", alcohol: "", sleep: "",
  familyHistory: false, conditions: [],
};

function num(v: string) {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) ? n : NaN;
}

function validate(step: number, f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  const range = (k: keyof Form, v: string, lo: number, hi: number, label: string) => {
    const n = num(v);
    if (Number.isNaN(n) || n < lo || n > hi) e[k] = `${label} must be ${lo}–${hi}`;
  };
  if (step === 0) {
    if (!f.patientName.trim()) e["patientName"] = "Patient name is required";
    range("age", f.age, 18, 110, "Age");
    if (!f.gender) e["gender"] = "Select gender";
    range("height", f.height, 100, 230, "Height (cm)");
    range("weight", f.weight, 30, 300, "Weight (kg)");
    range("bmi", f.bmi, 10, 70, "BMI");
  }
  if (step === 1) {
    if (!/^\d{2,3}\/\d{2,3}$/.test(f.bp.trim())) e["bp"] = "Use format 120/80";
    range("heartRate", f.heartRate, 30, 220, "Heart rate");
    range("glucose", f.glucose, 40, 600, "Glucose");
    range("cholesterol", f.cholesterol, 80, 500, "Cholesterol");
  }
  if (step === 2) {
    if (!f.exercise) e["exercise"] = "Select exercise level";
    if (!f.smoking) e["smoking"] = "Select smoking status";
    if (!f.alcohol) e["alcohol"] = "Select alcohol frequency";
    range("sleep", f.sleep, 0, 24, "Sleep hours");
  }
  return e;
}

type Result = { mode: "live" | "demo"; response: PredictionResponse };

export function MlPredictionForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const inApp = useServerFn(predictInApp);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: existingPatients } = usePatients();

  useEffect(() => {
    if (getMlApiUrl()) void checkMlBackend().then(setBackendUp);
    else setBackendUp(true);
  }, []);

  // Auto-fill BMI from height + weight.
  useEffect(() => {
    const h = num(form.height) / 100;
    const w = num(form.weight);
    if (h > 0 && w > 0) setForm((f) => ({ ...f, bmi: (w / (h * h)).toFixed(1) }));
  }, [form.height, form.weight]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const onSelectPatient = (pId: string) => {
    if (pId === "new") {
      setForm((f) => ({ ...f, patientId: "", patientName: "" }));
      return;
    }
    const p = existingPatients?.find((item) => item.id === pId);
    if (!p) return;
    setForm((f) => ({
      ...f,
      patientId: p.id,
      patientName: p.patient_code,
      age: String(p.age ?? ""),
      gender: p.gender ?? "",
      height: p.height_cm != null ? String(p.height_cm) : "",
      weight: p.weight_kg != null ? String(p.weight_kg) : "",
      bmi: p.bmi != null ? String(p.bmi) : "",
      bp: p.blood_pressure ?? "",
      heartRate: p.heart_rate != null ? String(p.heart_rate) : "",
      glucose: p.glucose != null ? String(p.glucose) : "",
      cholesterol: p.cholesterol != null ? String(p.cholesterol) : "",
      smoking: p.smoking_status ?? "",
      exercise: p.exercise_level ?? "",
      familyHistory: Boolean(p.family_history),
    }));
  };

  const next = () => {
    const e = validate(step, form);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  };

  const buildRequest = (): PredictionRequest => ({
    age: num(form.age), gender: form.gender, bmi: num(form.bmi),
    blood_pressure: form.bp.trim(), heart_rate: num(form.heartRate),
    glucose: num(form.glucose), cholesterol: num(form.cholesterol),
    exercise_level: form.exercise, smoking_status: form.smoking,
    sleep_hours: num(form.sleep), family_history: form.familyHistory,
    height_cm: num(form.height), weight_kg: num(form.weight),
    alcohol_frequency: form.alcohol, previous_conditions: form.conditions,
  });

  const submit = async () => {
    setBusy(true);
    setFailure(null);
    setResult(null);
    const req = buildRequest();
    try {
      let resp: PredictionResponse;
      if (getMlApiUrl()) {
        resp = await predictRisk(req);
      } else {
        const response = await inApp({
          data: {
            age: req.age, gender: req.gender, bmi: req.bmi, blood_pressure: req.blood_pressure,
            heart_rate: req.heart_rate, glucose: req.glucose, cholesterol: req.cholesterol,
            smoking_status: req.smoking_status, exercise_level: req.exercise_level,
            family_history: req.family_history,
          },
        });
        resp = response as PredictionResponse;
      }
      setResult({ mode: "live", response: resp });
      setBackendUp(true);

      // Save predicted data to user's database
      saveUserPrediction({
        patientId: form.patientId || undefined,
        patientName: form.patientName.trim(),
        overallRisk: resp.overall_risk,
        riskLevel: resp.risk_level,
        modelName: resp.model_name,
        diseases: (resp.diseases || []).map((d) => ({
          disease_name: d.disease,
          risk_score: d.risk_percentage ?? 0,
        })),
        patientData: {
          patient_name: form.patientName.trim(),
          age: req.age,
          gender: req.gender,
          height_cm: req.height_cm,
          weight_kg: req.weight_kg,
          bmi: req.bmi,
          blood_pressure: req.blood_pressure,
          heart_rate: req.heart_rate,
          glucose: req.glucose,
          cholesterol: req.cholesterol,
          smoking_status: req.smoking_status,
          exercise_level: req.exercise_level,
          family_history: req.family_history,
        },
        userId: user?.id,
      });

      void queryClient.invalidateQueries({ queryKey: ["risk-predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      void queryClient.invalidateQueries({ queryKey: ["patient-latest-risk"] });
      void queryClient.invalidateQueries({ queryKey: ["cohort-patients"] });
      void queryClient.invalidateQueries({ queryKey: ["cohort-predictions"] });
      void queryClient.invalidateQueries({ queryKey: ["cohort-diseases"] });
      void queryClient.invalidateQueries({ queryKey: ["disease-predictions"] });

      toast.success(`Risk prediction saved for ${form.patientName.trim()} (${resp.overall_risk}%)`);
    } catch (err) {
      setFailure(err instanceof MlBackendUnavailableError
        ? "The external ML service could not be reached."
        : err instanceof Error ? err.message : "Prediction failed.");
    }
    setBusy(false);
  };

  const field = (k: keyof Form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ml-${k}`}>{label}</Label>
      <Input id={`ml-${k}`} value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} {...props} />
      {errors[k] && <p className="text-destructive text-xs">{errors[k]}</p>}
    </div>
  );

  const select = (k: keyof Form, label: string, options: string[]) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ml-${k}`}>{label}</Label>
      <Select value={form[k] as string} onValueChange={(v) => set(k, v as never)}>
        <SelectTrigger id={`ml-${k}`}><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o.toLowerCase()}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
      {errors[k] && <p className="text-destructive text-xs">{errors[k]}</p>}
    </div>
  );

  return (
    <DashboardCard
      title="ML risk prediction"
      description="Enter anonymized values; the ML prediction service returns per-disease predictions from trained models. Research use only — not a diagnosis."
    >
      <div className="space-y-5">
        {backendUp === false && (
          <div className="border-warning/40 bg-warning/10 text-warning flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
            <AlertTriangle className="size-4" /> External ML service unreachable
          </div>
        )}
        {backendUp === true && (
          <div className="border-success/40 bg-success/10 text-success flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium">
            <Server className="size-4" /> ML prediction service connected · trained models
          </div>
        )}

        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s} className={`rounded-lg border px-3 py-2 text-xs ${i === step ? "border-primary bg-primary/10 text-primary font-semibold" : i < step ? "border-border text-foreground" : "border-border text-muted-foreground"}`}>
              Step {i + 1} · {s}
            </li>
          ))}
        </ol>

        <div className="grid gap-4 sm:grid-cols-2">
          {step === 0 && (<>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ml-patient-select">Load existing patient (optional)</Label>
              <Select value={form.patientId || "new"} onValueChange={onSelectPatient}>
                <SelectTrigger id="ml-patient-select">
                  <SelectValue placeholder="Choose an existing patient or create new" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">+ Enter a new patient</SelectItem>
                  {(existingPatients ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.patient_code} ({p.age}y, {p.gender})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ml-patientName">Patient Name</Label>
              <Input
                id="ml-patientName"
                value={form.patientName}
                onChange={(e) => set("patientName", e.target.value)}
                placeholder="e.g. John Doe"
              />
              {errors["patientName"] && <p className="text-destructive text-xs">{errors["patientName"]}</p>}
            </div>
            {field("age", "Age (years)", { inputMode: "numeric" })}
            {select("gender", "Gender", ["Female", "Male", "Other"])}
            {field("height", "Height (cm)", { inputMode: "decimal" })}
            {field("weight", "Weight (kg)", { inputMode: "decimal" })}
            {field("bmi", "BMI (auto-calculated)", { inputMode: "decimal" })}
          </>)}
          {step === 1 && (<>
            {field("bp", "Blood pressure (mmHg)", { placeholder: "120/80" })}
            {field("heartRate", "Resting heart rate (bpm)", { inputMode: "numeric" })}
            {field("glucose", "Glucose (mg/dL)", { inputMode: "decimal" })}
            {field("cholesterol", "Total cholesterol (mg/dL)", { inputMode: "decimal" })}
          </>)}
          {step === 2 && (<>
            {select("exercise", "Exercise level", ["Sedentary", "Low", "Moderate", "High"])}
            {select("smoking", "Smoking status", ["Never", "Former", "Current"])}
            {select("alcohol", "Alcohol frequency", ["Never", "Monthly", "Weekly", "Daily"])}
            {field("sleep", "Sleep hours per night", { inputMode: "decimal" })}
          </>)}
          {step === 3 && (<>
            <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
              <Label htmlFor="ml-family">Family history of cardiometabolic disease</Label>
              <Switch id="ml-family" checked={form.familyHistory} onCheckedChange={(v) => set("familyHistory", v)} />
            </div>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">Previous conditions</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {CONDITIONS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.conditions.includes(c)}
                      onCheckedChange={(v) => set("conditions", v ? [...form.conditions, c] : form.conditions.filter((x) => x !== c))}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
          </>)}
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="outline" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="size-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Next <ChevronRight className="size-4" /></Button>
          ) : (
            <Button onClick={() => void submit()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Predict & Save Risk
            </Button>
          )}
        </div>

        {failure && <p className="text-destructive text-sm">{failure}</p>}

        {result && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-semibold">{result.response.overall_risk}%</span>
              <RiskBadge level={result.response.risk_level} />
              <span className="text-muted-foreground text-xs">
                {result.response.model_name} · {new Date(result.response.prediction_timestamp).toLocaleString()}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {result.response.diseases.map((d) => (
                <div key={d.disease} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{d.disease}</span>
                    <RiskBadge level={d.risk_level ?? "unknown"} />
                  </div>
                  <p className="mt-1 text-xl font-semibold">
                    {d.risk_percentage == null ? "—" : `${d.risk_percentage}%`}
                  </p>
                  <p className="text-muted-foreground text-xs">Model: {d.model_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardCard>
  );
}
