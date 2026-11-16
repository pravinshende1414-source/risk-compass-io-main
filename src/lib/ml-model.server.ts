/**
 * Trained logistic-regression models (see AGENTS.md). Weights were fit offline
 * on public research datasets and are stored in ml-models.json; inference is
 * a standardized dot product + sigmoid.
 */
import bundle from "@/lib/ml-models.json";

type TrainedModel = (typeof bundle.models)[number];

export const ML_MODEL_VERSION = bundle.version;

export function getModel(name: string): TrainedModel {
  const m = bundle.models.find((x) => x.name === name);
  if (!m) throw new Error(`Model ${name} not found`);
  return m;
}

/** Returns probability (0-100) or null when an input is missing. */
export function predict(name: string, inputs: Record<string, number | null>): number | null {
  const m = getModel(name);
  let z = m.intercept;
  for (let i = 0; i < m.features.length; i++) {
    const v = inputs[m.features[i]!];
    if (v == null || !Number.isFinite(v)) return null;
    z += m.weights[i]! * ((v - m.mean[i]!) / m.std[i]!);
  }
  return (1 / (1 + Math.exp(-z))) * 100;
}
