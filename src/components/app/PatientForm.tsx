import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { computeBmi, type PatientInput, type PatientRecord } from "@/lib/patients";

const schema = z.object({
  patient_name: z.string().trim().min(1, "Patient name is required").max(100, "Patient name is too long"),
  age: z.coerce.number().int().min(1, "Age must be at least 1").max(120, "Age must be under 121"),
  gender: z.string().min(1, "Select a gender"),
  height_cm: z.coerce.number().min(50).max(250).nullable(),
  weight_kg: z.coerce.number().min(10).max(400).nullable(),
  bmi: z.coerce.number().min(5).max(90).nullable(),
  blood_pressure: z
    .string()
    .regex(/^\d{2,3}\/\d{2,3}$/, "Use the format 120/80")
    .nullable(),
  heart_rate: z.coerce.number().int().min(20).max(250).nullable(),
  glucose: z.coerce.number().min(20).max(600).nullable(),
  cholesterol: z.coerce.number().min(50).max(500).nullable(),
  smoking_status: z.string().nullable(),
  exercise_level: z.string().nullable(),
  family_history: z.boolean(),
});

type FormState = {
  patient_name: string;
  age: string;
  gender: string;
  height_cm: string;
  weight_kg: string;
  bmi: string;
  blood_pressure: string;
  heart_rate: string;
  glucose: string;
  cholesterol: string;
  smoking_status: string;
  exercise_level: string;
  family_history: boolean;
};

const EMPTY: FormState = {
  patient_name: "",
  age: "",
  gender: "",
  height_cm: "",
  weight_kg: "",
  bmi: "",
  blood_pressure: "",
  heart_rate: "",
  glucose: "",
  cholesterol: "",
  smoking_status: "",
  exercise_level: "",
  family_history: false,
};

function fromRecord(p: PatientRecord): FormState {
  return {
    patient_name: p.patient_code ?? "",
    age: String(p.age ?? ""),
    gender: p.gender ?? "",
    height_cm: p.height_cm != null ? String(p.height_cm) : "",
    weight_kg: p.weight_kg != null ? String(p.weight_kg) : "",
    bmi: p.bmi != null ? String(p.bmi) : "",
    blood_pressure: p.blood_pressure ?? "",
    heart_rate: p.heart_rate != null ? String(p.heart_rate) : "",
    glucose: p.glucose != null ? String(p.glucose) : "",
    cholesterol: p.cholesterol != null ? String(p.cholesterol) : "",
    smoking_status: p.smoking_status ?? "",
    exercise_level: p.exercise_level ?? "",
    family_history: Boolean(p.family_history),
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const text = (v: string) => (v.trim() === "" ? null : v.trim());

export function PatientForm({
  patient,
  submitting,
  onCancel,
  onSubmit,
}: {
  patient?: PatientRecord | null;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (input: PatientInput) => void;
}) {
  const [form, setForm] = useState<FormState>(patient ? fromRecord(patient) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setForm(patient ? fromRecord(patient) : EMPTY);
    setErrors({});
  }, [patient]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }) as FormState);

  const autoBmi = computeBmi(num(form.height_cm), num(form.weight_kg));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const candidate = {
      patient_name: form.patient_name.trim(),
      age: form.age,
      gender: form.gender,
      height_cm: num(form.height_cm),
      weight_kg: num(form.weight_kg),
      bmi: num(form.bmi) ?? autoBmi,
      blood_pressure: text(form.blood_pressure),
      heart_rate: num(form.heart_rate),
      glucose: num(form.glucose),
      cholesterol: num(form.cholesterol),
      smoking_status: text(form.smoking_status),
      exercise_level: text(form.exercise_level),
      family_history: form.family_history,
    };
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(parsed.data as PatientInput);
  };

  const field = (
    key: keyof FormState,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={Boolean(errors[key])}
        {...props}
      />
      {errors[key] && <p className="text-destructive text-xs">{errors[key]}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="patient_name">Patient name</Label>
          <Input
            id="patient_name"
            value={form.patient_name}
            onChange={(e) => set("patient_name", e.target.value)}
            placeholder="e.g. John Doe"
            aria-invalid={Boolean(errors.patient_name)}
          />
          {errors.patient_name && <p className="text-destructive text-xs">{errors.patient_name}</p>}
        </div>

        {field("age", "Age", { inputMode: "numeric", placeholder: "54" })}

        <div className="space-y-1.5">
          <Label htmlFor="gender">Gender</Label>
          <Select value={form.gender} onValueChange={(v) => set("gender", v)}>
            <SelectTrigger id="gender">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          {errors['gender'] && <p className="text-destructive text-xs">{errors['gender']}</p>}
        </div>

        {field("height_cm", "Height (cm)", { inputMode: "decimal", placeholder: "172" })}
        {field("weight_kg", "Weight (kg)", { inputMode: "decimal", placeholder: "78" })}
        {field("bmi", "BMI", {
          inputMode: "decimal",
          placeholder: autoBmi != null ? `Auto: ${autoBmi}` : "26.4",
        })}
        {field("blood_pressure", "Blood pressure", { placeholder: "120/80" })}
        {field("heart_rate", "Heart rate (bpm)", { inputMode: "numeric", placeholder: "72" })}
        {field("glucose", "Glucose (mg/dL)", { inputMode: "decimal", placeholder: "98" })}
        {field("cholesterol", "Cholesterol (mg/dL)", { inputMode: "decimal", placeholder: "190" })}

        <div className="space-y-1.5">
          <Label htmlFor="smoking_status">Smoking status</Label>
          <Select value={form.smoking_status} onValueChange={(v) => set("smoking_status", v)}>
            <SelectTrigger id="smoking_status">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">Never</SelectItem>
              <SelectItem value="former">Former</SelectItem>
              <SelectItem value="current">Current</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="exercise_level">Exercise level</Label>
          <Select value={form.exercise_level} onValueChange={(v) => set("exercise_level", v)}>
            <SelectTrigger id="exercise_level">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-border/70 flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
          <div>
            <Label htmlFor="family_history">Family history</Label>
            <p className="text-muted-foreground text-xs">
              Synthetic flag for related conditions in the family record.
            </p>
          </div>
          <Switch
            id="family_history"
            checked={form.family_history}
            onCheckedChange={(v) => set("family_history", v)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : patient ? "Save changes" : "Add patient"}
        </Button>
      </div>
    </form>
  );
}
