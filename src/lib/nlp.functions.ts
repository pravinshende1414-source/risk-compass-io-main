import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NlpEntity = { text: string; label: string; negated: boolean; confidence: number };
export type NlpRiskFactor = { factor: string; evidence: string };
export type NlpResult = {
  engine: string;
  extracted_text: string;
  word_count: number;
  entities: NlpEntity[];
  important_terms: { term: string; count: number }[];
  risk_factors: NlpRiskFactor[];
  key_findings: string[];
  confidence: number;
};

const MEASURES: { label: string; re: RegExp; unit: string }[] = [
  { label: "Blood pressure", re: /(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:mm\s?hg)?/i, unit: "mmHg" },
  { label: "Heart rate", re: /(?:heart rate|pulse|hr)\D{0,12}(\d{2,3})\s*(?:bpm)?/i, unit: "bpm" },
  { label: "Glucose", re: /glucose\D{0,15}(\d{2,3})\s*(?:mg\/dl)?/i, unit: "mg/dL" },
  { label: "HbA1c", re: /(?:hba1c|a1c)\D{0,10}(\d{1,2}(?:\.\d)?)\s*%?/i, unit: "%" },
  { label: "Cholesterol", re: /cholesterol\D{0,15}(\d{2,3})\s*(?:mg\/dl)?/i, unit: "mg/dL" },
  { label: "BMI", re: /bmi\D{0,8}(\d{2}(?:\.\d)?)/i, unit: "kg/m²" },
  { label: "Age", re: /(\d{1,3})[- ](?:year|yr)s?[- ]old/i, unit: "years" },
];

const VOCAB: Record<string, string[]> = {
  CONDITION: ["hypertension", "diabetes", "cardiovascular disease", "coronary artery disease", "heart failure", "stroke", "obesity", "asthma", "copd", "kidney disease", "hyperlipidemia", "dyslipidemia", "atrial fibrillation"],
  SYMPTOM: ["chest pain", "dyspnea", "shortness of breath", "edema", "fatigue", "palpitations", "dizziness", "headache", "cough", "polyuria"],
  MEDICATION: ["metformin", "insulin", "statin", "atorvastatin", "lisinopril", "amlodipine", "aspirin", "losartan", "metoprolol"],
  LIFESTYLE: ["smoker", "former smoker", "non-smoker", "alcohol", "sedentary", "exercise", "diet"],
  PROCEDURE: ["lipid panel", "ecg", "echocardiogram", "blood test", "x-ray", "follow-up"],
  FAMILY_HISTORY: ["family history"],
};

const STOP = new Set("the a an and or of to in for on with without at by from is are was were be been has have had this that it as no not patient reports denies per mg dl mmhg bpm".split(" "));
const MED_TERMS = new Set(Object.values(VOCAB).flat().flatMap((t) => t.split(" ")).concat(["glucose", "cholesterol", "bmi", "blood", "pressure", "risk", "lipid", "hba1c"]));

function isNegated(lower: string, idx: number) {
  const window = lower.slice(Math.max(0, idx - 25), idx);
  return /\b(denies|denied|no|without|negative for|absence of)\b[^.]*$/.test(window);
}

function analyze(raw: string): NlpResult {
  // Cleaning: remove control chars, collapse whitespace.
  const text = raw.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const lower = text.toLowerCase();
  const tokens = lower.match(/[a-z][a-z0-9-]+/g) ?? [];

  const entities: NlpEntity[] = [];
  const values: Record<string, number[]> = {};
  for (const m of MEASURES) {
    const hit = text.match(m.re);
    if (!hit) continue;
    const v = m.label === "Blood pressure" ? `${hit[1]}/${hit[2]} ${m.unit}` : `${hit[1]} ${m.unit}`;
    values[m.label] = [Number(hit[1]), Number(hit[2] ?? NaN)];
    entities.push({ text: `${m.label}: ${v}`, label: "MEASUREMENT", negated: false, confidence: 0.93 });
  }
  for (const [label, terms] of Object.entries(VOCAB)) {
    for (const term of terms) {
      const idx = lower.search(new RegExp(`\\b${term.replace(/[-]/g, "\\-")}\\b`));
      if (idx < 0) continue;
      if (term === "smoker" && /(former|non-)smoker/.test(lower)) continue;
      const negated = isNegated(lower, idx);
      entities.push({ text: term, label, negated, confidence: negated ? 0.72 : 0.84 });
    }
  }

  const freq = new Map<string, number>();
  for (const t of tokens) if (!STOP.has(t) && t.length > 2) freq.set(t, (freq.get(t) ?? 0) + 1);
  const important_terms = [...freq.entries()]
    .map(([term, count]) => ({ term, count, score: count * (MED_TERMS.has(term) ? 3 : 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ term, count }) => ({ term, count }));

  const rf: NlpRiskFactor[] = [];
  const bp = values["Blood pressure"];
  if (bp && (bp[0]! >= 130 || bp[1]! >= 80)) rf.push({ factor: "Elevated blood pressure", evidence: `${bp[0]}/${bp[1]} mmHg (≥130/80)` });
  const g = values["Glucose"]?.[0];
  if (g != null && g >= 100) rf.push({ factor: "Elevated glucose", evidence: `${g} mg/dL (≥100)` });
  const a1c = values["HbA1c"]?.[0];
  if (a1c != null && a1c >= 5.7) rf.push({ factor: "Elevated HbA1c", evidence: `${a1c}% (≥5.7)` });
  const c = values["Cholesterol"]?.[0];
  if (c != null && c >= 200) rf.push({ factor: "Elevated cholesterol", evidence: `${c} mg/dL (≥200)` });
  const b = values["BMI"]?.[0];
  if (b != null && b >= 25) rf.push({ factor: b >= 30 ? "BMI in obesity range" : "BMI in overweight range", evidence: `BMI ${b}` });
  const pos = (t: string) => entities.some((e) => e.text === t && !e.negated);
  if (pos("smoker")) rf.push({ factor: "Current smoking", evidence: "mentions 'smoker'" });
  else if (pos("former smoker")) rf.push({ factor: "Former smoking", evidence: "mentions 'former smoker'" });
  if (pos("family history")) rf.push({ factor: "Family history noted", evidence: "mentions 'family history'" });
  if (pos("sedentary")) rf.push({ factor: "Sedentary lifestyle", evidence: "mentions 'sedentary'" });
  for (const e of entities) if (e.label === "CONDITION" && !e.negated) rf.push({ factor: `Documented ${e.text}`, evidence: "condition mentioned in text" });

  const key_findings: string[] = [];
  const meas = entities.filter((e) => e.label === "MEASUREMENT");
  if (meas.length) key_findings.push(`${meas.length} measurement${meas.length > 1 ? "s" : ""} extracted: ${meas.map((e) => e.text).join("; ")}.`);
  const neg = entities.filter((e) => e.negated);
  if (neg.length) key_findings.push(`Explicitly negated mentions: ${neg.map((e) => e.text).join(", ")}.`);
  if (rf.length) key_findings.push(`${rf.length} potential risk factor${rf.length > 1 ? "s" : ""} identified by threshold and keyword rules.`);
  const meds = entities.filter((e) => e.label === "MEDICATION" && !e.negated);
  if (meds.length) key_findings.push(`Medications mentioned: ${meds.map((e) => e.text).join(", ")}.`);
  if (!entities.length) key_findings.push("No recognised clinical entities were found in this text.");

  const confidence = entities.length ? Math.round((entities.reduce((s, e) => s + e.confidence, 0) / entities.length) * 1000) / 10 : 0;

  return {
    engine: "in-app rule-based NLP v1",
    extracted_text: text,
    word_count: tokens.length,
    entities,
    important_terms,
    risk_factors: rf,
    key_findings,
    confidence,
  };
}

const MetaSchema = z.object({
  file_name: z.string().min(1).max(255),
  file_type: z.enum(["pdf", "txt", "docx"]),
  file_size_bytes: z.number().int().positive().max(10 * 1024 * 1024),
});

/** In-app fallback for POST /api/nlp/analyze. Stores metadata only — never the report text. */
export const analyzeReportText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MetaSchema.extend({ text: z.string().max(50_000) }).parse(input))
  .handler(async ({ data, context }) => {
    if (!data.text.trim()) throw new Error("No readable text was found in this file.");
    const result = analyze(data.text);
    const { data: row, error } = await context.supabase
      .from("nlp_reports")
      .insert({
        user_id: context.userId,
        file_name: data.file_name,
        file_type: data.file_type,
        file_size_bytes: data.file_size_bytes,
        status: "completed",
        engine: result.engine,
        word_count: result.word_count,
        entity_count: result.entities.length,
        risk_factor_count: result.risk_factors.length,
        confidence: result.confidence,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ...result, report_id: row.id };
  });

/** Records a failed analysis (metadata only). */
export const recordNlpFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MetaSchema.extend({ engine: z.string().max(80), error_message: z.string().max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.from("nlp_reports").insert({ ...data, user_id: context.userId, status: "failed" });
    return { ok: true };
  });

/** Records metadata for a result produced by the external Python backend. */
export const recordNlpSuccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    MetaSchema.extend({ engine: z.string().max(80), word_count: z.number().int(), entity_count: z.number().int(), risk_factor_count: z.number().int(), confidence: z.number().min(0).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase.from("nlp_reports").insert({ ...data, user_id: context.userId, status: "completed" });
    return { ok: true };
  });
