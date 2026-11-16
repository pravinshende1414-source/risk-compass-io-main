import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import {
  getUserPatients,
  getUserPatient,
  createUserPatient,
  updateUserPatient,
  deleteUserPatient,
  getUserLatestRiskMap,
  getUserPatientMeasurements,
  getUserPatientPredictions,
  getActiveUser,
} from "@/lib/user-database";

export type PatientRecord = {
  id: string;
  patient_code: string;
  age: number;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  blood_pressure: string | null;
  heart_rate: number | null;
  glucose: number | null;
  cholesterol: number | null;
  smoking_status: string | null;
  exercise_level: string | null;
  family_history: boolean;
  created_at: string;
  updated_at: string;
};

export type PatientInput = {
  patient_name?: string;
  age: number;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  blood_pressure: string | null;
  heart_rate: number | null;
  glucose: number | null;
  cholesterol: number | null;
  smoking_status: string | null;
  exercise_level: string | null;
  family_history: boolean;
};

export type MeasurementRecord = {
  id: string;
  patient_id: string;
  measurement_type: string;
  value: number;
  unit: string | null;
  measurement_date: string;
};

export type PredictionRecord = {
  id: string;
  patient_id: string;
  overall_risk: number;
  risk_level: string;
  model_name: string;
  prediction_date: string;
};

const PATIENT_COLUMNS =
  "id, patient_code, age, gender, height_cm, weight_kg, bmi, blood_pressure, heart_rate, glucose, cholesterol, smoking_status, exercise_level, family_history, created_at, updated_at";

export function usePatients() {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["patients", activeUser?.id],
    queryFn: async (): Promise<PatientRecord[]> => {
      try {
        const local = getUserPatients(activeUser?.id);
        if (local && local.length > 0) return local;
        const { data, error } = await supabase
          .from("patients")
          .select(PATIENT_COLUMNS)
          .order("patient_code", { ascending: true });
        if (!error && data && data.length > 0) return data as PatientRecord[];
      } catch {
        // fallback
      }
      return getUserPatients(activeUser?.id);
    },
  });
}

export function usePatient(patientId: string) {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["patient", patientId, activeUser?.id],
    queryFn: async (): Promise<PatientRecord | null> => {
      try {
        const local = getUserPatient(patientId, activeUser?.id);
        if (local) return local;
        const { data, error } = await supabase
          .from("patients")
          .select(PATIENT_COLUMNS)
          .eq("id", patientId)
          .maybeSingle();
        if (!error && data) return data as PatientRecord;
      } catch {
        // fallback
      }
      return getUserPatient(patientId, activeUser?.id);
    },
  });
}

export function usePatientMeasurements(patientId: string) {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["patient-measurements", patientId, activeUser?.id],
    queryFn: async (): Promise<MeasurementRecord[]> => {
      try {
        const local = getUserPatientMeasurements(patientId, activeUser?.id);
        if (local && local.length > 0) return local;
        const { data, error } = await supabase
          .from("health_measurements")
          .select("id, patient_id, measurement_type, value, unit, measurement_date")
          .eq("patient_id", patientId)
          .order("measurement_date", { ascending: true });
        if (!error && data && data.length > 0) return data as MeasurementRecord[];
      } catch {
        // fallback
      }
      return getUserPatientMeasurements(patientId, activeUser?.id);
    },
  });
}

export function usePatientPredictions(patientId: string) {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["patient-predictions", patientId, activeUser?.id],
    queryFn: async () => {
      try {
        const local = getUserPatientPredictions(patientId, activeUser?.id);
        if (local && local.length > 0) return local;
        const { data, error } = await supabase
          .from("risk_predictions")
          .select(
            "id, patient_id, overall_risk, risk_level, model_name, prediction_date, disease_predictions(id, disease_name, risk_score)",
          )
          .eq("patient_id", patientId)
          .order("prediction_date", { ascending: false });
        if (!error && data && data.length > 0) return data as any;
      } catch {
        // fallback
      }
      return getUserPatientPredictions(patientId, activeUser?.id) as any;
    },
  });
}

/** All risk predictions, used to show a score alongside each row in the cohort list. */
export function useLatestRiskByPatient() {
  const activeUser = getActiveUser();
  return useQuery({
    queryKey: ["patient-latest-risk", activeUser?.id],
    queryFn: async () => {
      try {
        const local = getUserLatestRiskMap(activeUser?.id);
        if (local && local.size > 0) return local;
        const { data, error } = await supabase
          .from("risk_predictions")
          .select("patient_id, overall_risk, risk_level, prediction_date")
          .order("prediction_date", { ascending: false });
        if (!error && data && data.length > 0) {
          const map = new Map<string, { overall_risk: number; risk_level: string }>();
          for (const row of data ?? []) {
            if (!map.has(row.patient_id)) {
              map.set(row.patient_id, {
                overall_risk: Number(row.overall_risk),
                risk_level: String(row.risk_level),
              });
            }
          }
          return map;
        }
      } catch {
        // fallback
      }
      return getUserLatestRiskMap(activeUser?.id);
    },
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PatientInput) => {
      const activeUser = getActiveUser();
      const local = createUserPatient(input, activeUser?.id);
      try {
        const { patient_name, ...rest } = input;
        await supabase
          .from("patients")
          .insert({ ...rest, patient_code: local.patient_code });
      } catch {
        // offline fallback
      }
      void logAudit("patient.create", { patient_code: local.patient_code });
      return local;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useUpdatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PatientInput }) => {
      const activeUser = getActiveUser();
      const local = updateUserPatient(id, input, activeUser?.id);
      try {
        const { patient_name, ...rest } = input;
        const updateData: Record<string, unknown> = { ...rest };
        if (patient_name?.trim()) updateData.patient_code = patient_name.trim();
        await supabase.from("patients").update(updateData).eq("id", id);
      } catch {
        // offline fallback
      }
      void logAudit("patient.update", { patient_id: id });
      return local;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patient: { id: string; patient_code: string }) => {
      const activeUser = getActiveUser();
      deleteUserPatient(patient.id, activeUser?.id);
      try {
        await supabase.from("patients").delete().eq("id", patient.id);
      } catch {
        // offline fallback
      }
      void logAudit("patient.delete", {
        patient_id: patient.id,
        patient_code: patient.patient_code,
      });
      return patient.id;
    },
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function computeBmi(heightCm: number | null, weightKg: number | null) {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function normalizeRiskLevel(level: string | null | undefined) {
  const value = (level ?? "").toLowerCase();
  if (value === "medium" || value === "moderate") return "moderate" as const;
  if (value === "high") return "high" as const;
  if (value === "critical") return "critical" as const;
  if (value === "low") return "low" as const;
  return "unknown" as const;
}
