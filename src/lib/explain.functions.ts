import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RiskEstimate } from "@/lib/risk-types";

const PATIENT_COLUMNS =
  "id, patient_code, age, gender, bmi, blood_pressure, heart_rate, glucose, cholesterol, smoking_status, exercise_level, family_history";

const SYSTEM_PROMPT = `You write plain-language educational explanations of clinical risk scores for healthcare researchers working with SYNTHETIC, anonymised patient records on an educational research platform.

Rules:
- This is never diagnosis, treatment or medical advice. Never suggest treatment, medication, or that anyone see a doctor about "this patient" — the record is synthetic.
- Explain only from the scores and inputs you are given. Never invent numbers, history, or inputs that are not listed.
- Cover, in this order, with short markdown headings:
  1. What the scores say — restate each condition score in plain words, what the published instrument actually measures, and over what time horizon.
  2. Which inputs drove the risk — connect the record's values to the score direction.
  3. Limitations — be explicit about missing inputs, about indices that are not probabilities, and about population/derivation limits of each instrument (e.g. Framingham derived from a largely white US cohort; FINDRISC from Finnish adults).
  4. How to read this responsibly — how a researcher should and should not use these numbers.
- Around 300-450 words. No bullet-point walls of jargon; write for a smart reader who is not a statistician.`;

function describeEstimate(
  patient: Record<string, unknown>,
  estimate: RiskEstimate,
  context: string,
) {
  const lines = [
    `Anonymised record: ${String(patient['patient_code'])}`,
    `Age: ${String(patient['age'])} · Sex recorded as: ${String(patient['gender'])}`,
    `BMI: ${String(patient['bmi'])} · Blood pressure: ${String(patient['blood_pressure'])} · Resting heart rate: ${String(patient['heart_rate'])}`,
    `Glucose: ${String(patient['glucose'])} · Total cholesterol: ${String(patient['cholesterol'])}`,
    `Smoking status: ${String(patient['smoking_status'])} · Exercise level: ${String(patient['exercise_level'])} · Family history: ${patient['family_history'] ? "yes" : "no"}`,
    "",
    `Headline score: ${estimate.overall}% (${estimate.level} band), model ${estimate.modelName}. The headline is the highest published probability across the scored conditions.`,
    "",
    "Condition scores:",
    ...estimate.diseases.map(
      (d) =>
        `- ${d.disease_name}: ${d.risk_score}%${d.isProbability ? " (published probability)" : " (index, NOT a probability)"} — source: ${d.source}. Note: ${d.note}`,
    ),
    "",
    "Inputs the equations used:",
    ...estimate.contributions.map((c) => `- ${c.factor}: ${c.detail}`),
    "",
    estimate.missingInputs.length
      ? `Inputs the equations need but this record does not carry: ${estimate.missingInputs.join(", ")}.`
      : "No required inputs were missing.",
  ];
  if (context.trim()) {
    lines.push("", `Additional health context supplied by the researcher: ${context.trim()}`);
  }
  return lines.join("\n");
}

export const explainPatientRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { patientId: string; context?: string }) => {
    if (!input?.patientId) throw new Error("A patient record is required.");
    const context = (input.context ?? "").slice(0, 2000);
    return { patientId: input.patientId, context };
  })
  .handler(async ({ data, context }): Promise<{ explanation: string; model: string }> => {
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const { data: patient, error } = await context.supabase
      .from("patients")
      .select(PATIENT_COLUMNS)
      .eq("id", data.patientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!patient) throw new Error("Patient record not found.");

    const { computeClinicalRisk } = await import("@/lib/clinical-risk.server");
    const estimate = computeClinicalRisk(patient as never);

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const { createLovableAiGatewayRunIdFetch } = await import("@/lib/ai-gateway.server");

    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch as unknown as typeof fetch,
    });

    const model = "openai/gpt-6-astra";
    let explanation: string;
    try {
      const result = streamText({
        model: lovable.responses(model),
        system: SYSTEM_PROMPT,
        prompt: describeEstimate(patient as never, estimate, data.context),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      explanation = await result.text;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.includes("402")) {
        throw new Error("AI credits are exhausted for this workspace. Add credits to continue.");
      }
      if (message.includes("429")) {
        throw new Error("The AI service is busy right now. Try again in a moment.");
      }
      throw new Error("The explanation could not be generated. Please try again.");
    }

    if (!explanation.trim()) {
      throw new Error("The model returned an empty explanation. Please try again.");
    }

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "prediction.explain",
      details: {
        patient_code: (patient as { patient_code: string }).patient_code,
        overall_risk: estimate.overall,
        model,
      } as never,
    });

    return { explanation, model };
  });
