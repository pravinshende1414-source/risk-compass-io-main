import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RiskEstimate } from "@/lib/risk-types";

const PATIENT_COLUMNS =
  "id, patient_code, age, gender, bmi, blood_pressure, heart_rate, glucose, cholesterol, smoking_status, exercise_level, family_history";

/** Compute a clinical estimate for one patient without storing it. */
export const previewPatientRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { patientId: string }) => input)
  .handler(async ({ data, context }): Promise<RiskEstimate> => {
    const { computeClinicalRisk } = await import("@/lib/clinical-risk.server");
    const { data: patient, error } = await context.supabase
      .from("patients")
      .select(PATIENT_COLUMNS)
      .eq("id", data.patientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!patient) throw new Error("Patient record not found.");
    return computeClinicalRisk(patient);
  });

async function scoreAndStore(
  supabase: { from: (t: string) => any },
  patient: Record<string, unknown>,
) {
  const { computeClinicalRisk } = await import("@/lib/clinical-risk.server");
  const estimate = computeClinicalRisk(patient as never);

  const { data: inserted, error } = await supabase
    .from("risk_predictions")
    .insert({
      patient_id: patient['id'] as string,
      overall_risk: estimate.overall,
      risk_level: estimate.level,
      model_name: estimate.modelName,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const predictionId = (inserted as { id: string }).id;
  const { error: diseaseError } = await supabase.from("disease_predictions").insert(
    estimate.diseases.map((d) => ({
      prediction_id: predictionId,
      disease_name: d.disease_name,
      risk_score: d.risk_score,
    })),
  );
  if (diseaseError) throw new Error(diseaseError.message);

  return { estimate, predictionId };
}

/** Compute and store a clinical estimate for one patient. */
export const runPatientRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { patientId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: patient, error } = await context.supabase
      .from("patients")
      .select(PATIENT_COLUMNS)
      .eq("id", data.patientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!patient) throw new Error("Patient record not found.");

    const result = await scoreAndStore(context.supabase as never, patient as never);

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "prediction.run",
      details: {
        patient_code: (patient as { patient_code: string }).patient_code,
        overall_risk: result.estimate.overall,
        model: result.estimate.modelName,
      } as never,
    });

    return result;
  });

/** Re-score every patient with the current clinical model. */
export const rescoreCohort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: patients, error } = await context.supabase
      .from("patients")
      .select(PATIENT_COLUMNS)
      .order("patient_code", { ascending: true });
    if (error) throw new Error(error.message);

    let scored = 0;
    for (const patient of patients ?? []) {
      await scoreAndStore(context.supabase as never, patient as never);
      scored += 1;
    }

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "prediction.rescore_cohort",
      details: { scored } as never,
    });

    return { scored };
  });

/** Score ad-hoc form input with the built-in models (used only as a labelled fallback). */
export const previewRiskFromInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    age: number; gender: string; bmi: number | null; blood_pressure: string | null;
    heart_rate: number | null; glucose: number | null; cholesterol: number | null;
    smoking_status: string | null; exercise_level: string | null; family_history: boolean;
  }) => {
    if (!Number.isFinite(input.age) || input.age < 18 || input.age > 110) throw new Error("Invalid age");
    return input;
  })
  .handler(async ({ data }): Promise<RiskEstimate> => {
    const { computeClinicalRisk } = await import("@/lib/clinical-risk.server");
    return computeClinicalRisk(data);
  });

/**
 * In-app ML prediction service — same contract as the FastAPI /api/predict
 * endpoint, backed by the trained logistic-regression models on the server.
 */
export const predictInApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    age: number; gender: string; bmi: number | null; blood_pressure: string | null;
    heart_rate: number | null; glucose: number | null; cholesterol: number | null;
    smoking_status: string | null; exercise_level: string | null; family_history: boolean;
  }) => {
    if (!Number.isFinite(input.age) || input.age < 18 || input.age > 110) throw new Error("Invalid age");
    return input;
  })
  .handler(async ({ data }) => {
    const { computeClinicalRisk } = await import("@/lib/clinical-risk.server");
    const est = computeClinicalRisk(data);
    const lvl = (p: number): "low" | "moderate" | "high" => (p >= 20 ? "high" : p >= 7.5 ? "moderate" : "low");
    const row = (label: string, name: string, modelName: string) => {
      const d = est.diseases.find((x) => x.disease_name === name);
      return d
        ? { disease: label, risk_percentage: d.risk_score, risk_level: d.isProbability ? lvl(d.risk_score) : null, model_name: modelName }
        : { disease: label, risk_percentage: null, risk_level: null, model_name: `${modelName} (missing inputs)` };
    };
    return {
      overall_risk: est.overall,
      risk_level: est.level,
      model_name: est.modelName,
      prediction_timestamp: new Date().toISOString(),
      diseases: [
        row("Heart Disease", "Cardiovascular disease", "Logistic regression · UCI Cleveland"),
        row("Diabetes", "Type 2 diabetes", "Logistic regression · Pima"),
        row("Hypertension", "Hypertension", "Framingham hypertension equation"),
        row("Metabolic Syndrome", "Metabolic syndrome", "NCEP ATP III criteria index"),
        row("Respiratory Disease", "Chronic respiratory risk", "COPD-PS screening index"),
      ],
    };
  });
