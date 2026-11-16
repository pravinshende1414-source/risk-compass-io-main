import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { previewPatientRisk, rescoreCohort, runPatientRisk } from "@/lib/risk.functions";
import type { RiskEstimate } from "@/lib/risk-types";

export { CLINICAL_MODEL_NAME } from "@/lib/risk-types";
export type { RiskEstimate } from "@/lib/risk-types";

/** Live preview of the clinical estimate for a selected record (nothing stored). */
export function useRiskPreview(patientId: string) {
  const preview = useServerFn(previewPatientRisk);
  return useQuery({
    queryKey: ["risk-preview", patientId],
    enabled: Boolean(patientId),
    queryFn: async (): Promise<RiskEstimate> => preview({ data: { patientId } }),
  });
}

export function useRunPrediction() {
  const qc = useQueryClient();
  const run = useServerFn(runPatientRisk);
  return useMutation({
    mutationFn: async (patientId: string) => run({ data: { patientId } }),
    onSuccess: () => void qc.invalidateQueries(),
  });
}

export function useRescoreCohort() {
  const qc = useQueryClient();
  const rescore = useServerFn(rescoreCohort);
  return useMutation({
    mutationFn: async () => rescore({}),
    onSuccess: () => void qc.invalidateQueries(),
  });
}
