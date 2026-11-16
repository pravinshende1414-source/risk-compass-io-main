/**
 * Client for the external Python FastAPI ML backend.
 * Set VITE_ML_API_URL (e.g. https://ml.example.com) to connect it.
 * No ML runs in the browser; when the backend is unreachable the caller
 * falls back to clearly labelled demo mode.
 */

export type PredictionRequest = {
  age: number;
  gender: string;
  bmi: number;
  blood_pressure: string;
  heart_rate: number;
  glucose: number;
  cholesterol: number;
  exercise_level: string;
  smoking_status: string;
  sleep_hours: number;
  family_history: boolean;
  // Extra context collected by the form (sent; backend may ignore).
  height_cm?: number;
  weight_kg?: number;
  alcohol_frequency?: string;
  previous_conditions?: string[];
};

export type DiseasePrediction = {
  disease: string;
  risk_percentage: number | null;
  risk_level: "low" | "moderate" | "high" | null;
  model_name: string;
};

export type PredictionResponse = {
  overall_risk: number;
  risk_level: "low" | "moderate" | "high";
  diseases: DiseasePrediction[];
  model_name: string;
  prediction_timestamp: string;
};

export class MlBackendUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "MlBackendUnavailableError";
  }
}

export function getMlApiUrl(): string | null {
  const url = import.meta.env['VITE_ML_API_URL'] as string | undefined;
  return url ? url.replace(/\/$/, "") : null;
}

export async function checkMlBackend(): Promise<boolean> {
  const base = getMlApiUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function predictRisk(req: PredictionRequest): Promise<PredictionResponse> {
  const base = getMlApiUrl();
  if (!base) throw new MlBackendUnavailableError("ML backend URL is not configured.");
  let res: Response;
  try {
    res = await fetch(`${base}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new MlBackendUnavailableError("ML backend could not be reached.");
  }
  if (res.status >= 500 || res.status === 404)
    throw new MlBackendUnavailableError(`ML backend returned ${res.status}.`);
  if (!res.ok) throw new Error((await res.text()) || `Prediction failed (${res.status}).`);
  return (await res.json()) as PredictionResponse;
}

export type ExplainApiResponse = {
  patient_id: string;
  model_name: string;
  features: { feature: string; value: string | number; impact: number; direction: string }[];
};

/** GET /api/explain/{patient_id} on the FastAPI backend (SHAP / LIME). */
export async function fetchExplanation(patientId: string): Promise<ExplainApiResponse> {
  const base = getMlApiUrl();
  if (!base) throw new MlBackendUnavailableError("ML backend URL is not configured.");
  let res: Response;
  try {
    res = await fetch(`${base}/api/explain/${encodeURIComponent(patientId)}`, {
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new MlBackendUnavailableError("ML backend could not be reached.");
  }
  if (res.status >= 500 || res.status === 404)
    throw new MlBackendUnavailableError(`ML backend returned ${res.status}.`);
  if (!res.ok) throw new Error((await res.text()) || `Explanation failed (${res.status}).`);
  return (await res.json()) as ExplainApiResponse;
}

/** POST /api/nlp/analyze (multipart "file") on the FastAPI backend, with upload progress. */
export function analyzeReportRemote(
  file: File,
  onProgress: (pct: number) => void,
): Promise<import("@/lib/nlp.functions").NlpResult> {
  const base = getMlApiUrl();
  if (!base) return Promise.reject(new MlBackendUnavailableError("ML backend URL is not configured."));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/api/nlp/analyze`);
    xhr.timeout = 60000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new MlBackendUnavailableError("ML backend could not be reached."));
    xhr.ontimeout = () => reject(new MlBackendUnavailableError("ML backend timed out."));
    xhr.onload = () => {
      if (xhr.status >= 500 || xhr.status === 404) return reject(new MlBackendUnavailableError(`ML backend returned ${xhr.status}.`));
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(xhr.responseText || `Analysis failed (${xhr.status}).`));
      try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Invalid response from ML backend.")); }
    };
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}
