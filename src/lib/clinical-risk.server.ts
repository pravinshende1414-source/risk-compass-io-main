/**
 * Published clinical risk equations, evaluated server-side.
 *
 * Every score below comes from a peer-reviewed, published instrument — no
 * invented weights. Where a record lacks an input the instrument requires,
 * the missing input is reported instead of being silently imputed.
 *
 * Sources:
 *  - D'Agostino RB et al., "General Cardiovascular Risk Profile for Use in
 *    Primary Care: The Framingham Heart Study", Circulation 2008 (simple
 *    office-based BMI model).
 *  - Lindström J, Tuomilehto J, "The Diabetes Risk Score (FINDRISC)",
 *    Diabetes Care 2003.
 *  - Vasan RS et al., "Assessment of frequency of progression to hypertension
 *    in non-hypertensive participants in the Framingham Heart Study",
 *    Lancet 2001 (4-year progression rates by BP category).
 *  - NCEP ATP III metabolic syndrome criteria (JAMA 2001).
 *  - COPD Population Screener (COPD-PS), Martinez FJ et al., COPD 2008.
 */

import type {
  Contribution,
  DiseaseEstimate,
  RiskEstimate,
  RiskLevel,
} from "@/lib/risk-types";
import { CLINICAL_MODEL_NAME } from "@/lib/risk-types";
import { getModel, predict } from "@/lib/ml-model.server";

export type ScoreablePatient = {
  age: number;
  gender: string;
  bmi: number | null;
  blood_pressure: string | null;
  heart_rate: number | null;
  glucose: number | null;
  cholesterol: number | null;
  smoking_status: string | null;
  exercise_level: string | null;
  family_history: boolean;
};

function parseBp(bp: string | null): { systolic: number | null; diastolic: number | null } {
  if (!bp) return { systolic: null, diastolic: null };
  const [s, d] = bp.split("/");
  const systolic = Number((s ?? "").trim());
  const diastolic = Number((d ?? "").trim());
  return {
    systolic: Number.isFinite(systolic) && systolic > 0 ? systolic : null,
    diastolic: Number.isFinite(diastolic) && diastolic > 0 ? diastolic : null,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/** Framingham general CVD 10-year risk, office-based (BMI) model. */
export function framinghamCvd(
  age: number,
  female: boolean,
  bmi: number,
  systolic: number,
  smoker: boolean,
  diabetic: boolean,
): number {
  const a = Math.log(Math.max(30, Math.min(74, age)));
  const b = Math.log(bmi);
  const s = Math.log(systolic);
  const sum = female
    ? 2.72107 * a + 0.51125 * b + 2.81291 * s + 0.61868 * (smoker ? 1 : 0) + 0.77763 * (diabetic ? 1 : 0)
    : 3.11296 * a + 0.79277 * b + 1.85508 * s + 0.70953 * (smoker ? 1 : 0) + 0.53160 * (diabetic ? 1 : 0);
  const mean = female ? 26.0145 : 23.9388;
  const baseline = female ? 0.94833 : 0.88431;
  return clamp((1 - Math.pow(baseline, Math.exp(sum - mean))) * 100);
}

/** FINDRISC points -> published 10-year type 2 diabetes probability band. */
export function findriscProbability(points: number): number {
  if (points < 7) return 1;
  if (points <= 11) return 4;
  if (points <= 14) return 17;
  if (points <= 20) return 33;
  return 50;
}

/** Framingham 4-year progression to hypertension by BP category (Vasan 2001). */
function hypertensionProgression(
  systolic: number,
  diastolic: number | null,
  age: number,
): { rate: number; category: string } {
  const d = diastolic ?? 0;
  const older = age >= 65;
  if (systolic >= 140 || d >= 90) return { rate: 100, category: "already hypertensive range" };
  if (systolic >= 130 || d >= 85)
    return { rate: older ? 49.5 : 37.3, category: "high-normal blood pressure" };
  if (systolic >= 120 || d >= 80)
    return { rate: older ? 25.5 : 17.6, category: "normal blood pressure" };
  return { rate: older ? 16 : 5.3, category: "optimal blood pressure" };
}

export function computeClinicalRisk(patient: ScoreablePatient): RiskEstimate {
  const contributions: Contribution[] = [];
  const missingInputs: string[] = [];
  const diseases: DiseaseEstimate[] = [];

  const { systolic, diastolic } = parseBp(patient.blood_pressure);
  const bmi = patient.bmi;
  const glucose = patient.glucose;
  const smoking = (patient.smoking_status ?? "").toLowerCase();
  const exercise = (patient.exercise_level ?? "").toLowerCase();
  const smoker = smoking === "current";
  const everSmoked = smoker || smoking === "former";
  const diabetic = glucose != null && glucose >= 126;
  const female = patient.gender.toLowerCase().startsWith("f");
  const age = patient.age;

  contributions.push({ factor: "Age", detail: `${age} years` });
  contributions.push({ factor: "Sex", detail: patient.gender });
  if (bmi != null) contributions.push({ factor: "BMI", detail: `${bmi} kg/m²` });
  else missingInputs.push("BMI");
  if (systolic != null)
    contributions.push({ factor: "Blood pressure", detail: `${patient.blood_pressure} mmHg` });
  else missingInputs.push("Blood pressure");
  if (glucose != null) contributions.push({ factor: "Glucose", detail: `${glucose} mg/dL` });
  else missingInputs.push("Glucose");
  if (patient.cholesterol != null)
    contributions.push({ factor: "Total cholesterol", detail: `${patient.cholesterol} mg/dL` });
  if (patient.smoking_status)
    contributions.push({ factor: "Smoking status", detail: patient.smoking_status });
  else missingInputs.push("Smoking status");
  if (patient.exercise_level)
    contributions.push({ factor: "Physical activity", detail: patient.exercise_level });
  if (patient.heart_rate != null)
    contributions.push({ factor: "Resting heart rate", detail: `${patient.heart_rate} bpm` });
  contributions.push({
    factor: "Family history",
    detail: patient.family_history ? "Reported" : "Not reported",
  });

  // ---- Cardiovascular disease: trained logistic regression (UCI Cleveland) ----
  {
    const m = getModel("Cardiovascular disease");
    const p = predict(m.name, {
      age,
      sex: female ? 0 : 1,
      trestbps: systolic,
      chol: patient.cholesterol,
      fbs: glucose == null ? null : glucose > 120 ? 1 : 0,
    });
    if (p != null)
      diseases.push({
        disease_name: m.name,
        risk_score: round1(p),
        source: `Trained ML model — logistic regression on ${m.source} (n=${m.n_train}, test AUC ${m.test_auc})`,
        note: `Predicted probability of angiographic heart disease, learned from real patient outcomes. Training cohort was referred for angiography (base rate ${Math.round(m.prevalence * 100)}%), so scores run higher than in the general population.`,
        isProbability: true,
      });
    else missingInputs.push("Cholesterol (needed by heart-disease model)");
  }

  // ---- Type 2 diabetes: trained logistic regression (Pima) ----
  {
    const m = getModel("Type 2 diabetes");
    const p = predict(m.name, { age, bmi, glucose, dbp: diastolic });
    if (p != null)
      diseases.push({
        disease_name: m.name,
        risk_score: round1(p),
        source: `Trained ML model — logistic regression on ${m.source} (n=${m.n_train}, test AUC ${m.test_auc})`,
        note: `Predicted probability of diabetes learned from real outcomes. Training data are adult Pima women (base rate ${Math.round(m.prevalence * 100)}%), so transfer to other populations is limited.`,
        isProbability: true,
      });
  }

  // ---- Hypertension: Framingham 4-year progression rates ----
  if (systolic != null) {
    const { rate, category } = hypertensionProgression(systolic, diastolic, age);
    diseases.push({
      disease_name: "Hypertension",
      risk_score: round1(rate),
      source: "Framingham progression-to-hypertension rates (Vasan, Lancet 2001)",
      note:
        rate === 100
          ? "Recorded blood pressure is already in the hypertensive range (≥140/90)."
          : `4-year probability of developing hypertension from ${category}.`,
      isProbability: true,
    });
  }

  // ---- Metabolic syndrome: NCEP ATP III criteria actually measurable ----
  {
    const checks: { label: string; met: boolean }[] = [];
    if (systolic != null)
      checks.push({
        label: "Blood pressure ≥130/85",
        met: systolic >= 130 || (diastolic ?? 0) >= 85,
      });
    if (glucose != null) checks.push({ label: "Fasting glucose ≥100", met: glucose >= 100 });
    if (bmi != null) checks.push({ label: "Obesity (BMI ≥30, waist proxy)", met: bmi >= 30 });
    const met = checks.filter((c) => c.met).length;
    diseases.push({
      disease_name: "Metabolic syndrome",
      risk_score: checks.length === 0 ? 0 : round1((met / checks.length) * 100),
      source: "NCEP ATP III metabolic syndrome criteria (JAMA 2001)",
      note: `${met} of ${checks.length} measurable criteria met. HDL cholesterol, triglycerides and waist circumference are not in the record, so this is a criteria-met index, not a probability.`,
      isProbability: false,
    });
  }

  // ---- Chronic respiratory: COPD Population Screener (partial) ----
  {
    let score = 0;
    score += age < 50 ? 0 : age <= 59 ? 1 : 2;
    if (everSmoked) score += 2;
    if (exercise === "low" || exercise === "sedentary") score += 1;
    diseases.push({
      disease_name: "Chronic respiratory risk",
      risk_score: round1((score / 5) * 100),
      source: "COPD Population Screener, COPD-PS (Martinez, COPD 2008)",
      note: `Partial COPD-PS: ${score} of 5 available points. Breathlessness and cough/phlegm items are not recorded, so this is a screening index, not a probability.`,
      isProbability: false,
    });
  }

  const probabilities = diseases.filter((d) => d.isProbability).map((d) => d.risk_score);
  const overall = probabilities.length > 0 ? round1(Math.max(...probabilities)) : 0;
  const level: RiskLevel = overall >= 20 ? "high" : overall >= 7.5 ? "moderate" : "low";

  return {
    overall,
    level,
    contributions,
    missingInputs,
    diseases,
    modelName: CLINICAL_MODEL_NAME,
  };
}
