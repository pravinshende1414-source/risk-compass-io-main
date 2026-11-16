import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExplainFeature = {
  feature: string;
  value: string;
  /** Contribution in percentage points of predicted risk (signed). */
  impact: number;
  direction: "increases" | "decreases";
};

export type ExplainResponse = {
  patient_id: string;
  model_name: string;
  base_value: number;
  prediction: number;
  method: string;
  features: ExplainFeature[];
};

const LABELS: Record<string, string> = {
  age: "Age",
  bmi: "BMI",
  glucose: "Glucose",
  dbp: "Diastolic blood pressure",
  sex: "Sex (male)",
  trestbps: "Systolic blood pressure",
  chol: "Cholesterol",
  fbs: "Fasting glucose > 120",
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Exact SHAP values for the trained logistic-regression models (linear model,
 * independent features): phi_i = w_i * (x_i - mean_i) / std_i in log-odds.
 * Converted to percentage points by distributing (p - base) proportionally.
 */
export const explainPatientShap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { patientId: string; model: string }) => {
    if (!input?.patientId) throw new Error("A patient record is required.");
    return { patientId: input.patientId, model: input.model || "Cardiovascular disease" };
  })
  .handler(async ({ data, context }): Promise<ExplainResponse> => {
    const { data: p, error } = await context.supabase
      .from("patients")
      .select("id, patient_code, age, gender, bmi, blood_pressure, glucose, cholesterol")
      .eq("id", data.patientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!p) throw new Error("Patient record not found.");

    const { getModel, ML_MODEL_VERSION } = await import("@/lib/ml-model.server");
    const m = getModel(data.model);
    const [s, d] = String(p.blood_pressure ?? "").split("/").map((x) => Number(x.trim()));
    const raw: Record<string, number | null> = {
      age: p.age,
      bmi: p.bmi == null ? null : Number(p.bmi),
      glucose: p.glucose == null ? null : Number(p.glucose),
      dbp: Number.isFinite(d) && d! > 0 ? d! : null,
      sex: String(p.gender).toLowerCase().startsWith("m") ? 1 : 0,
      trestbps: Number.isFinite(s) && s! > 0 ? s! : null,
      chol: p.cholesterol == null ? null : Number(p.cholesterol),
      fbs: p.glucose == null ? null : Number(p.glucose) > 120 ? 1 : 0,
    };

    const phis: { key: string; phi: number; x: number }[] = [];
    for (let i = 0; i < m.features.length; i++) {
      const key = m.features[i]!;
      const x = raw[key];
      if (x == null || !Number.isFinite(x)) {
        throw new Error(`This record has no ${LABELS[key] ?? key} value, so the model cannot explain it.`);
      }
      phis.push({ key, x, phi: m.weights[i]! * ((x - m.mean[i]!) / m.std[i]!) });
    }
    const z = m.intercept + phis.reduce((a, b) => a + b.phi, 0);
    const base = sigmoid(m.intercept) * 100;
    const pred = sigmoid(z) * 100;
    const totalPhi = phis.reduce((a, b) => a + b.phi, 0);
    const scale = Math.abs(totalPhi) > 1e-9 ? (pred - base) / totalPhi : 0;

    const fmt = (key: string, x: number) =>
      key === "sex" ? (x ? "Male" : "Female") : key === "fbs" ? (x ? "Yes" : "No") : String(Math.round(x * 10) / 10);

    const features = phis
      .map(({ key, x, phi }) => {
        const impact = Math.round(phi * scale * 10) / 10;
        return {
          feature: LABELS[key] ?? key,
          value: fmt(key, x),
          impact,
          direction: (phi >= 0 ? "increases" : "decreases") as ExplainFeature["direction"],
        };
      })
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    return {
      patient_id: p.patient_code,
      model_name: `${ML_MODEL_VERSION} · ${m.name}`,
      base_value: Math.round(base * 10) / 10,
      prediction: Math.round(pred * 10) / 10,
      method: "Exact SHAP (linear model)",
      features,
    };
  });
