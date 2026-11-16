import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getUserPatients, getUserPredictions, getUserDiseaseScores, getActiveUser } from "@/lib/user-database";

export type PatientRow = {
  id: string;
  patient_code: string;
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
  updated_at?: string;
};

export type DiseaseRow = {
  id?: string;
  prediction_id?: string;
  disease_name: string;
  risk_score: number;
};

export function useCohortDiseases() {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["cohort-diseases", activeUser?.id],
    queryFn: async (): Promise<DiseaseRow[]> => {
      try {
        const localScores = getUserDiseaseScores(activeUser?.id);
        if (localScores && localScores.length > 0) return localScores;
        const { data, error } = await supabase
          .from("disease_predictions")
          .select("id, prediction_id, disease_name, risk_score");
        if (!error && data && data.length > 0) return data as DiseaseRow[];
      } catch {
        // fallback
      }
      return getUserDiseaseScores(activeUser?.id);
    },
  });
}

export type PredictionRow = {
  id: string;
  patient_id: string;
  overall_risk: number;
  risk_level: string;
  model_name: string;
  prediction_date: string;
};

export function useCohortPatients() {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["cohort-patients", activeUser?.id],
    queryFn: async (): Promise<PatientRow[]> => {
      try {
        const localPatients = getUserPatients(activeUser?.id);
        if (localPatients && localPatients.length > 0) return localPatients as PatientRow[];
        const { data, error } = await supabase
          .from("patients")
          .select(
            "id, patient_code, age, gender, bmi, blood_pressure, heart_rate, glucose, cholesterol, smoking_status, exercise_level, family_history, updated_at",
          )
          .order("patient_code", { ascending: true });
        if (!error && data && data.length > 0) return data as PatientRow[];
      } catch {
        // fallback
      }
      return getUserPatients(activeUser?.id) as PatientRow[];
    },
  });
}

export function useCohortPredictions() {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["cohort-predictions", activeUser?.id],
    queryFn: async (): Promise<PredictionRow[]> => {
      try {
        const localPredictions = getUserPredictions(activeUser?.id);
        if (localPredictions && localPredictions.length > 0) return localPredictions as PredictionRow[];
        const { data, error } = await supabase
          .from("risk_predictions")
          .select("id, patient_id, overall_risk, risk_level, model_name, prediction_date")
          .order("prediction_date", { ascending: true });
        if (!error && data && data.length > 0) return data as PredictionRow[];
      } catch {
        // fallback
      }
      return getUserPredictions(activeUser?.id) as PredictionRow[];
    },
  });
}

export function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Pearson correlation, used for descriptive cohort statistics only. */
export function correlation(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}
