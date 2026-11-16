import { computeClinicalRisk } from "@/lib/clinical-risk.server";
import type { PatientInput, PatientRecord, MeasurementRecord } from "@/lib/patients";
import type { DiseaseEstimate, RiskLevel } from "@/lib/risk-types";

export type StoredPrediction = {
  id: string;
  patient_id: string;
  overall_risk: number;
  risk_level: string;
  model_name: string;
  prediction_date: string;
  user_id: string;
  disease_predictions: Array<{
    id: string;
    prediction_id: string;
    disease_name: string;
    risk_score: number;
  }>;
};

export type UserDatabase = {
  patients: PatientRecord[];
  measurements: MeasurementRecord[];
  predictions: StoredPrediction[];
};

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  role?: string;
};

const SESSION_KEY = "healthrisk_active_session";
const USERS_KEY = "healthrisk_registered_users";

export function getActiveUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      return JSON.parse(raw) as AuthUser;
    }
  } catch {
    // ignore
  }
  return null;
}

export function setActiveUserSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearActiveUserSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

export function getRegisteredUsers(): Array<AuthUser & { password?: string }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

export function registerLocalUser(input: { fullName: string; email: string; password?: string }): AuthUser {
  const users = getRegisteredUsers();
  const existing = users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
  if (existing) {
    const active: AuthUser = {
      id: existing.id,
      email: existing.email,
      full_name: existing.full_name || input.fullName,
      role: existing.role || "researcher",
    };
    setActiveUserSession(active);
    return active;
  }

  const cleanId = "usr_" + btoa(input.email.toLowerCase()).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  const newUser: AuthUser & { password?: string } = {
    id: cleanId,
    email: input.email.toLowerCase(),
    full_name: input.fullName,
    password: input.password || "password",
    role: "researcher",
  };
  users.push(newUser);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));

  const active: AuthUser = {
    id: newUser.id,
    email: newUser.email,
    full_name: newUser.full_name,
    role: newUser.role,
  };
  setActiveUserSession(active);
  // Initialize user's own database
  getUserDatabase(newUser.id);
  return active;
}

export function loginLocalUser(input: { email: string; password?: string }): AuthUser {
  const users = getRegisteredUsers();
  const match = users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
  if (match) {
    const active: AuthUser = {
      id: match.id,
      email: match.email,
      full_name: match.full_name || match.email.split("@")[0] || "User",
      role: match.role || "researcher",
    };
    setActiveUserSession(active);
    return active;
  }

  // Create on the fly if new login
  return registerLocalUser({
    fullName: input.email.split("@")[0] || "Researcher",
    email: input.email,
    password: input.password,
  });
}

function getDbStorageKey(userId?: string): string {
  const uid = userId || getActiveUser()?.id || "default_user";
  return `healthrisk_db_${uid}`;
}

function seedDefaultData(userId: string): UserDatabase {
  const now = Date.now();
  const p1Id = `pat_${userId}_1`;
  const p2Id = `pat_${userId}_2`;
  const p3Id = `pat_${userId}_3`;

  const patients: PatientRecord[] = [
    {
      id: p1Id,
      patient_code: "Sarah Connor",
      age: 42,
      gender: "female",
      height_cm: 168,
      weight_kg: 64,
      bmi: 22.7,
      blood_pressure: "118/76",
      heart_rate: 68,
      glucose: 92,
      cholesterol: 175,
      smoking_status: "never",
      exercise_level: "high",
      family_history: false,
      created_at: new Date(now - 86400000 * 4).toISOString(),
      updated_at: new Date(now - 86400000 * 4).toISOString(),
    },
    {
      id: p2Id,
      patient_code: "Michael Scott",
      age: 51,
      gender: "male",
      height_cm: 175,
      weight_kg: 86,
      bmi: 28.1,
      blood_pressure: "138/88",
      heart_rate: 78,
      glucose: 114,
      cholesterol: 228,
      smoking_status: "former",
      exercise_level: "low",
      family_history: true,
      created_at: new Date(now - 86400000 * 2).toISOString(),
      updated_at: new Date(now - 86400000 * 2).toISOString(),
    },
    {
      id: p3Id,
      patient_code: "Priya Sharma",
      age: 36,
      gender: "female",
      height_cm: 162,
      weight_kg: 58,
      bmi: 22.1,
      blood_pressure: "112/72",
      heart_rate: 72,
      glucose: 88,
      cholesterol: 165,
      smoking_status: "never",
      exercise_level: "moderate",
      family_history: false,
      created_at: new Date(now - 86400000 * 1).toISOString(),
      updated_at: new Date(now - 86400000 * 1).toISOString(),
    },
  ];

  const measurements: MeasurementRecord[] = [
    { id: `m_${now}_1`, patient_id: p1Id, measurement_type: "glucose", value: 92, unit: "mg/dL", measurement_date: new Date(now - 86400000 * 4).toISOString().slice(0, 10) },
    { id: `m_${now}_2`, patient_id: p1Id, measurement_type: "cholesterol", value: 175, unit: "mg/dL", measurement_date: new Date(now - 86400000 * 4).toISOString().slice(0, 10) },
    { id: `m_${now}_3`, patient_id: p2Id, measurement_type: "glucose", value: 114, unit: "mg/dL", measurement_date: new Date(now - 86400000 * 2).toISOString().slice(0, 10) },
    { id: `m_${now}_4`, patient_id: p2Id, measurement_type: "cholesterol", value: 228, unit: "mg/dL", measurement_date: new Date(now - 86400000 * 2).toISOString().slice(0, 10) },
  ];

  const pred1Id = `pred_${now}_1`;
  const pred2Id = `pred_${now}_2`;

  const predictions: StoredPrediction[] = [
    {
      id: pred1Id,
      patient_id: p2Id,
      overall_risk: 24.8,
      risk_level: "high",
      model_name: "Published clinical instruments (Framingham / FINDRISC / ATP III / COPD-PS)",
      prediction_date: new Date(now - 86400000 * 2).toISOString(),
      user_id: userId,
      disease_predictions: [
        { id: `dp_${now}_1`, prediction_id: pred1Id, disease_name: "Cardiovascular disease", risk_score: 24.8 },
        { id: `dp_${now}_2`, prediction_id: pred1Id, disease_name: "Type 2 diabetes", risk_score: 18.0 },
        { id: `dp_${now}_3`, prediction_id: pred1Id, disease_name: "Hypertension", risk_score: 22.0 },
        { id: `dp_${now}_4`, prediction_id: pred1Id, disease_name: "Metabolic syndrome", risk_score: 33.3 },
      ],
    },
    {
      id: pred2Id,
      patient_id: p1Id,
      overall_risk: 4.2,
      risk_level: "low",
      model_name: "Published clinical instruments (Framingham / FINDRISC / ATP III / COPD-PS)",
      prediction_date: new Date(now - 86400000 * 4).toISOString(),
      user_id: userId,
      disease_predictions: [
        { id: `dp_${now}_5`, prediction_id: pred2Id, disease_name: "Cardiovascular disease", risk_score: 4.2 },
        { id: `dp_${now}_6`, prediction_id: pred2Id, disease_name: "Type 2 diabetes", risk_score: 2.1 },
        { id: `dp_${now}_7`, prediction_id: pred2Id, disease_name: "Hypertension", risk_score: 5.0 },
        { id: `dp_${now}_8`, prediction_id: pred2Id, disease_name: "Metabolic syndrome", risk_score: 0.0 },
      ],
    },
  ];

  return { patients, measurements, predictions };
}

export function getUserDatabase(userId?: string): UserDatabase {
  if (typeof window === "undefined") {
    return { patients: [], measurements: [], predictions: [] };
  }
  const uid = userId || getActiveUser()?.id || "default_user";
  const key = getDbStorageKey(uid);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.patients)) {
        return parsed as UserDatabase;
      }
    }
  } catch {
    // ignore
  }

  const seeded = seedDefaultData(uid);
  try {
    localStorage.setItem(key, JSON.stringify(seeded));
  } catch {
    // ignore
  }
  return seeded;
}

export function saveUserDatabase(data: UserDatabase, userId?: string) {
  if (typeof window === "undefined") return;
  const uid = userId || getActiveUser()?.id || "default_user";
  const key = getDbStorageKey(uid);
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save user database", err);
  }
}

// ---------------- Patients ----------------

export function getUserPatients(userId?: string): PatientRecord[] {
  const db = getUserDatabase(userId);
  return [...db.patients].sort((a, b) => a.patient_code.localeCompare(b.patient_code));
}

export function getUserPatient(patientId: string, userId?: string): PatientRecord | null {
  const db = getUserDatabase(userId);
  return db.patients.find((p) => p.id === patientId) ?? null;
}

export function createUserPatient(input: PatientInput, userId?: string): PatientRecord {
  const db = getUserDatabase(userId);
  const uid = userId || getActiveUser()?.id || "default_user";
  const now = new Date().toISOString();
  const id = `pat_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const patient_code = input.patient_name?.trim() || `Patient-${Math.floor(Math.random() * 9000 + 1000)}`;

  const newPatient: PatientRecord = {
    id,
    patient_code,
    age: input.age,
    gender: input.gender,
    height_cm: input.height_cm,
    weight_kg: input.weight_kg,
    bmi: input.bmi,
    blood_pressure: input.blood_pressure,
    heart_rate: input.heart_rate,
    glucose: input.glucose,
    cholesterol: input.cholesterol,
    smoking_status: input.smoking_status,
    exercise_level: input.exercise_level,
    family_history: input.family_history,
    created_at: now,
    updated_at: now,
  };

  db.patients.push(newPatient);

  if (input.glucose != null) {
    db.measurements.push({
      id: `m_${Date.now()}_gl`,
      patient_id: id,
      measurement_type: "glucose",
      value: input.glucose,
      unit: "mg/dL",
      measurement_date: now.slice(0, 10),
    });
  }
  if (input.cholesterol != null) {
    db.measurements.push({
      id: `m_${Date.now()}_ch`,
      patient_id: id,
      measurement_type: "cholesterol",
      value: input.cholesterol,
      unit: "mg/dL",
      measurement_date: now.slice(0, 10),
    });
  }

  saveUserDatabase(db, uid);
  return newPatient;
}

export function updateUserPatient(id: string, input: PatientInput, userId?: string): PatientRecord {
  const db = getUserDatabase(userId);
  const uid = userId || getActiveUser()?.id || "default_user";
  const index = db.patients.findIndex((p) => p.id === id);
  if (index === -1) throw new Error("Patient record not found");

  const existing = db.patients[index]!;
  const patient_code = input.patient_name?.trim() || existing.patient_code;

  const updated: PatientRecord = {
    ...existing,
    patient_code,
    age: input.age,
    gender: input.gender,
    height_cm: input.height_cm,
    weight_kg: input.weight_kg,
    bmi: input.bmi,
    blood_pressure: input.blood_pressure,
    heart_rate: input.heart_rate,
    glucose: input.glucose,
    cholesterol: input.cholesterol,
    smoking_status: input.smoking_status,
    exercise_level: input.exercise_level,
    family_history: input.family_history,
    updated_at: new Date().toISOString(),
  };

  db.patients[index] = updated;
  saveUserDatabase(db, uid);
  return updated;
}

export function deleteUserPatient(patientId: string, userId?: string): void {
  const db = getUserDatabase(userId);
  const uid = userId || getActiveUser()?.id || "default_user";
  db.patients = db.patients.filter((p) => p.id !== patientId);
  db.predictions = db.predictions.filter((pr) => pr.patient_id !== patientId);
  db.measurements = db.measurements.filter((m) => m.patient_id !== patientId);
  saveUserDatabase(db, uid);
}

// ---------------- Predictions ----------------

export type PredictionRowView = {
  id: string;
  patient_id: string;
  overall_risk: number;
  risk_level: string;
  model_name: string;
  prediction_date: string;
  patients: { patient_code: string; age: number; gender: string } | null;
  disease_predictions: Array<{ id: string; disease_name: string; risk_score: number }>;
};

export function getUserPredictions(userId?: string): PredictionRowView[] {
  const db = getUserDatabase(userId);
  const patientMap = new Map(db.patients.map((p) => [p.id, p]));

  return db.predictions
    .map((pr) => {
      const p = patientMap.get(pr.patient_id);
      return {
        id: pr.id,
        patient_id: pr.patient_id,
        overall_risk: pr.overall_risk,
        risk_level: pr.risk_level,
        model_name: pr.model_name,
        prediction_date: pr.prediction_date,
        patients: p ? { patient_code: p.patient_code, age: p.age, gender: p.gender } : null,
        disease_predictions: pr.disease_predictions || [],
      };
    })
    .sort((a, b) => new Date(b.prediction_date).getTime() - new Date(a.prediction_date).getTime());
}

export function getUserPatientPredictions(patientId: string, userId?: string) {
  const db = getUserDatabase(userId);
  return db.predictions
    .filter((pr) => pr.patient_id === patientId)
    .sort((a, b) => new Date(b.prediction_date).getTime() - new Date(a.prediction_date).getTime());
}

export function getUserLatestRiskMap(userId?: string): Map<string, { overall_risk: number; risk_level: string }> {
  const db = getUserDatabase(userId);
  const map = new Map<string, { overall_risk: number; risk_level: string }>();

  // sort newest first
  const sorted = [...db.predictions].sort(
    (a, b) => new Date(b.prediction_date).getTime() - new Date(a.prediction_date).getTime(),
  );

  for (const row of sorted) {
    if (!map.has(row.patient_id)) {
      map.set(row.patient_id, {
        overall_risk: Number(row.overall_risk),
        risk_level: String(row.risk_level),
      });
    }
  }
  return map;
}

export function getUserPatientMeasurements(patientId: string, userId?: string): MeasurementRecord[] {
  const db = getUserDatabase(userId);
  return db.measurements
    .filter((m) => m.patient_id === patientId)
    .sort((a, b) => new Date(a.measurement_date).getTime() - new Date(b.measurement_date).getTime());
}

export function getUserDiseaseScores(userId?: string): Array<{ disease_name: string; risk_score: number }> {
  const db = getUserDatabase(userId);
  const seenPatients = new Set<string>();
  const rows: Array<{ disease_name: string; risk_score: number }> = [];

  const sorted = [...db.predictions].sort(
    (a, b) => new Date(b.prediction_date).getTime() - new Date(a.prediction_date).getTime(),
  );

  for (const pred of sorted) {
    if (seenPatients.has(pred.patient_id)) continue;
    seenPatients.add(pred.patient_id);
    for (const d of pred.disease_predictions || []) {
      rows.push({ disease_name: d.disease_name, risk_score: d.risk_score });
    }
  }
  return rows;
}

export function saveUserPrediction(params: {
  patientId?: string;
  patientName?: string;
  overallRisk: number;
  riskLevel: string;
  modelName: string;
  diseases?: Array<{ disease_name: string; risk_score: number }>;
  patientData?: Partial<PatientInput>;
  userId?: string;
}): StoredPrediction {
  const uid = params.userId || getActiveUser()?.id || "default_user";
  const db = getUserDatabase(uid);
  const now = new Date().toISOString();

  let targetPatient: PatientRecord | undefined;

  if (params.patientId) {
    targetPatient = db.patients.find((p) => p.id === params.patientId);
  }

  const nameCandidate = params.patientName?.trim() || params.patientData?.patient_name?.trim();

  if (!targetPatient && nameCandidate) {
    targetPatient = db.patients.find((p) => p.patient_code.toLowerCase() === nameCandidate.toLowerCase());
  }

  // Create patient if does not exist yet
  if (!targetPatient) {
    const newId = `pat_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const patientName = nameCandidate || `Patient ${db.patients.length + 1}`;
    targetPatient = {
      id: newId,
      patient_code: patientName,
      age: params.patientData?.age ?? 45,
      gender: params.patientData?.gender ?? "other",
      height_cm: params.patientData?.height_cm ?? null,
      weight_kg: params.patientData?.weight_kg ?? null,
      bmi: params.patientData?.bmi ?? null,
      blood_pressure: params.patientData?.blood_pressure ?? null,
      heart_rate: params.patientData?.heart_rate ?? null,
      glucose: params.patientData?.glucose ?? null,
      cholesterol: params.patientData?.cholesterol ?? null,
      smoking_status: params.patientData?.smoking_status ?? null,
      exercise_level: params.patientData?.exercise_level ?? null,
      family_history: params.patientData?.family_history ?? false,
      created_at: now,
      updated_at: now,
    };
    db.patients.push(targetPatient);
  } else if (params.patientData) {
    // Update patient metrics with recent values
    Object.assign(targetPatient, {
      age: params.patientData.age ?? targetPatient.age,
      gender: params.patientData.gender ?? targetPatient.gender,
      height_cm: params.patientData.height_cm ?? targetPatient.height_cm,
      weight_kg: params.patientData.weight_kg ?? targetPatient.weight_kg,
      bmi: params.patientData.bmi ?? targetPatient.bmi,
      blood_pressure: params.patientData.blood_pressure ?? targetPatient.blood_pressure,
      heart_rate: params.patientData.heart_rate ?? targetPatient.heart_rate,
      glucose: params.patientData.glucose ?? targetPatient.glucose,
      cholesterol: params.patientData.cholesterol ?? targetPatient.cholesterol,
      smoking_status: params.patientData.smoking_status ?? targetPatient.smoking_status,
      exercise_level: params.patientData.exercise_level ?? targetPatient.exercise_level,
      family_history: params.patientData.family_history ?? targetPatient.family_history,
      updated_at: now,
    });
  }

  const predictionId = `pred_${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const storedPrediction: StoredPrediction = {
    id: predictionId,
    patient_id: targetPatient.id,
    overall_risk: Number(params.overallRisk.toFixed(1)),
    risk_level: params.riskLevel,
    model_name: params.modelName,
    prediction_date: now,
    user_id: uid,
    disease_predictions: (params.diseases || []).map((d, idx) => ({
      id: `dp_${predictionId}_${idx}`,
      prediction_id: predictionId,
      disease_name: d.disease_name,
      risk_score: Number(d.risk_score.toFixed(1)),
    })),
  };

  db.predictions.unshift(storedPrediction);

  // Record measurements if vitals were provided
  if (params.patientData?.glucose != null) {
    db.measurements.push({
      id: `m_${Date.now()}_gl`,
      patient_id: targetPatient.id,
      measurement_type: "glucose",
      value: params.patientData.glucose,
      unit: "mg/dL",
      measurement_date: now.slice(0, 10),
    });
  }
  if (params.patientData?.cholesterol != null) {
    db.measurements.push({
      id: `m_${Date.now()}_ch`,
      patient_id: targetPatient.id,
      measurement_type: "cholesterol",
      value: params.patientData.cholesterol,
      unit: "mg/dL",
      measurement_date: now.slice(0, 10),
    });
  }

  saveUserDatabase(db, uid);
  return storedPrediction;
}
