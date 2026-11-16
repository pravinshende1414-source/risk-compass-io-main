/**
 * Shared, client-safe types for the clinical risk engine.
 * The equations themselves live server-side in `clinical-risk.server.ts`.
 */

export const CLINICAL_MODEL_NAME = "ml-logreg-v1 + clinical-equations";

export type RiskLevel = "low" | "moderate" | "high";

export type DiseaseEstimate = {
  disease_name: string;
  /** 0-100. A probability where the equation yields one, otherwise a documented index. */
  risk_score: number;
  /** Published equation or criteria the score comes from. */
  source: string;
  /** What the number means, and any input the record does not contain. */
  note: string;
  /** True when the score is a real published probability (e.g. 10-year risk). */
  isProbability: boolean;
};

export type Contribution = { factor: string; detail: string };

export type RiskEstimate = {
  /** 0-100 headline score: the highest published probability available. */
  overall: number;
  level: RiskLevel;
  /** Inputs the equations actually used. */
  contributions: Contribution[];
  /** Inputs the equations need but the record does not carry. */
  missingInputs: string[];
  diseases: DiseaseEstimate[];
  modelName: string;
};
