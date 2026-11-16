import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { DashboardCard } from "@/components/app/DashboardCard";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { PageHeader } from "@/components/app/PagePlaceholder";
import { EmptyState } from "@/components/app/States";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { extractText, formatBytes, NLP_MAX_CHARS, readFileWithProgress, validateReportFile, type NlpFileType } from "@/lib/nlp-extract";
import { analyzeReportText, recordNlpFailure, recordNlpSuccess, type NlpResult } from "@/lib/nlp.functions";
import { analyzeReportRemote, getMlApiUrl, MlBackendUnavailableError } from "@/services/predictionService";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_shell/nlp")({
  head: () => ({
    meta: [
      { title: "NLP Report Analyzer — HealthRisk AI" },
      { name: "description", content: "Upload PDF, TXT or DOCX research reports and extract entities, terms and risk factors." },
      { property: "og:title", content: "NLP Report Analyzer — HealthRisk AI" },
      { property: "og:description", content: "Upload PDF, TXT or DOCX research reports and extract entities, terms and risk factors." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NlpPage,
});

const SAMPLE_NOTE = `Synthetic record SYN-004, 58-year-old male, presents for routine follow-up.
BP 142/90 mmHg, heart rate 78 bpm, fasting glucose 118 mg/dL, total cholesterol 236 mg/dL, BMI 29.4.
History: former smoker (quit 2019), family history of cardiovascular disease. Takes atorvastatin.
Reports moderate exercise twice weekly. Denies chest pain, dyspnea, or edema.
Plan: repeat lipid panel in 3 months, continue lifestyle counselling.`;

type Stage = "idle" | "reading" | "extracting" | "uploading" | "analyzing" | "done" | "error";
const STAGE_LABEL: Record<Stage, string> = {
  idle: "Waiting for a file",
  reading: "Reading file",
  extracting: "Extracting text",
  uploading: "Uploading to NLP service",
  analyzing: "Running NLP analysis",
  done: "Analysis complete",
  error: "Analysis failed",
};

const ENTITY_STYLE: Record<string, string> = {
  MEASUREMENT: "bg-primary/10 text-primary",
  CONDITION: "bg-destructive/10 text-destructive",
  SYMPTOM: "bg-warning/15 text-warning",
  MEDICATION: "bg-success/15 text-success",
};

function NlpPage() {
  const qc = useQueryClient();
  const analyzeFn = useServerFn(analyzeReportText);
  const failFn = useServerFn(recordNlpFailure);
  const okFn = useServerFn(recordNlpSuccess);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(NlpResult & { truncated?: boolean }) | null>(null);
  const busy = !["idle", "done", "error"].includes(stage);

  const history = useQuery({
    queryKey: ["nlp_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nlp_reports")
        .select("id, file_name, file_type, file_size_bytes, status, engine, entity_count, risk_factor_count, confidence, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  async function process(f: File) {
    setFile(f);
    setResult(null);
    setError(null);
    setProgress(0);
    const v = validateReportFile(f);
    if (!v.ok) {
      setStage("error");
      setError(v.error);
      return;
    }
    const meta = { file_name: f.name.slice(0, 255), file_type: v.type as NlpFileType, file_size_bytes: f.size };
    let engine = "in-app rule-based NLP v1";
    try {
      if (getMlApiUrl()) {
        try {
          setStage("uploading");
          const remote = await analyzeReportRemote(f, (p) => setProgress(p));
          setStage("analyzing");
          engine = remote.engine || "FastAPI NLP backend";
          await okFn({ data: { ...meta, engine: engine.slice(0, 80), word_count: remote.word_count, entity_count: remote.entities.length, risk_factor_count: remote.risk_factors.length, confidence: remote.confidence } });
          setResult(remote);
          setStage("done");
          return;
        } catch (e) {
          if (!(e instanceof MlBackendUnavailableError)) throw e;
        }
      }
      setStage("reading");
      const buf = await readFileWithProgress(f, (p) => setProgress(Math.round(p * 0.4)));
      setStage("extracting");
      setProgress(50);
      let text: string;
      try {
        text = await extractText(buf, v.type);
      } catch {
        throw new Error("Text could not be extracted. The file may be damaged, password-protected or scanned images only.");
      }
      if (!text.trim()) throw new Error("No readable text was found in this file.");
      const truncated = text.length > NLP_MAX_CHARS;
      setStage("analyzing");
      setProgress(75);
      const r = await analyzeFn({ data: { ...meta, text: text.slice(0, NLP_MAX_CHARS) } });
      setProgress(100);
      setResult({ ...r, truncated });
      setStage("done");
      void logAudit("nlp.analyze_report", { file_type: meta.file_type, entities: r.entities.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Analysis failed.";
      setError(msg);
      setStage("error");
      void failFn({ data: { ...meta, engine, error_message: msg.slice(0, 300) } }).catch(() => {});
    } finally {
      void qc.invalidateQueries({ queryKey: ["nlp_reports"] });
    }
  }

  function onFiles(list: FileList | null) {
    const f = list?.[0];
    if (f && !busy) void process(f);
  }

  const reset = () => {
    setFile(null);
    setStage("idle");
    setResult(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="NLP Report Analyzer"
        description="Upload a synthetic research report to extract text, entities, important terms and potential risk factors. For educational/research analysis only."
        icon={FileText}
      />
      <DisclaimerBanner />

      <DashboardCard
        title="Upload report"
        description="PDF, TXT or DOCX · up to 10 MB · synthetic or anonymised documents only"
        action={
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void process(new File([SAMPLE_NOTE], "sample-note.txt", { type: "text/plain" }))}>
            Try sample note
          </Button>
        }
      >
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload a report file"
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
          className={cn(
            "border-border hover:border-primary/60 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            drag && "border-primary bg-primary/5",
            busy && "cursor-not-allowed opacity-60",
          )}
        >
          <UploadCloud className="text-primary size-8" />
          <p className="text-sm font-medium">Drag and drop a file here, or click to browse</p>
          <p className="text-muted-foreground text-xs">Accepted: .pdf, .txt, .docx — maximum 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }}
          />
        </div>

        {file && (
          <div className="border-border mt-4 rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="text-muted-foreground size-5 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-xs">{formatBytes(file.size)}</p>
                </div>
              </div>
              {!busy && (
                <Button variant="ghost" size="icon" aria-label="Clear file" onClick={reset}><X className="size-4" /></Button>
              )}
            </div>
            <Progress value={stage === "error" ? 100 : progress} className={cn("mt-3", stage === "error" && "[&>div]:bg-destructive")} />
            <div className="mt-2 flex items-center gap-2 text-xs">
              {busy && <Loader2 className="text-primary size-3.5 animate-spin" />}
              {stage === "done" && <CheckCircle2 className="text-success size-3.5" />}
              {stage === "error" && <AlertCircle className="text-destructive size-3.5" />}
              <span className={cn(stage === "error" ? "text-destructive" : stage === "done" ? "text-success" : "text-muted-foreground")}>
                {STAGE_LABEL[stage]}{busy ? ` · ${progress}%` : ""}
              </span>
            </div>
            {error && <p role="alert" className="text-destructive mt-2 text-sm">{error}</p>}
          </div>
        )}
      </DashboardCard>

      {result && (
        <>
          <p className="bg-primary/5 text-foreground rounded-lg px-4 py-2 text-sm font-medium">
            For educational/research analysis only. These results are automated text extraction, not a diagnosis.
          </p>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              ["NLP confidence", `${result.confidence}%`],
              ["Entities", result.entities.length],
              ["Risk factors", result.risk_factors.length],
              ["Words", result.word_count],
            ].map(([k, v]) => (
              <div key={k} className="border-border bg-card rounded-xl border p-4">
                <p className="text-muted-foreground text-xs">{k}</p>
                <p className="font-display mt-1 text-2xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground -mt-2 text-xs">Engine: {result.engine}. Confidence is the average extraction certainty of the matched entities, not the certainty of any health outcome.</p>

          <div className="grid gap-5 lg:grid-cols-2">
            <DashboardCard title="Key findings" description="Summary of what was extracted">
              <ul className="space-y-2">
                {result.key_findings.map((f) => <li key={f} className="text-sm leading-relaxed">• {f}</li>)}
              </ul>
            </DashboardCard>
            <DashboardCard title="Potential risk factors" description="Rule-based flags from extracted values and terms">
              {result.risk_factors.length === 0 ? (
                <p className="text-muted-foreground text-sm">None identified.</p>
              ) : (
                <ul className="space-y-2">
                  {result.risk_factors.map((r) => (
                    <li key={r.factor} className="border-border/70 flex items-center justify-between gap-3 rounded-lg border p-2.5">
                      <span className="text-sm font-medium">{r.factor}</span>
                      <span className="text-muted-foreground text-xs">{r.evidence}</span>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
            <DashboardCard title="Detected entities" description="Named entities with label and extraction confidence">
              {result.entities.length === 0 ? (
                <p className="text-muted-foreground text-sm">No entities detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {result.entities.map((e) => (
                    <span key={e.label + e.text} title={`${e.label} · ${Math.round(e.confidence * 100)}%`} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", ENTITY_STYLE[e.label] ?? "bg-muted text-foreground", e.negated && "line-through opacity-70")}>
                      {e.text} <span className="opacity-60">· {e.label.toLowerCase().replace("_", " ")}{e.negated ? " · negated" : ""}</span>
                    </span>
                  ))}
                </div>
              )}
            </DashboardCard>
            <DashboardCard title="Important terms" description="Most frequent terms, weighted toward medical vocabulary">
              <div className="flex flex-wrap gap-2">
                {result.important_terms.map((t) => (
                  <span key={t.term} className="bg-muted rounded-md px-2 py-1 text-xs">{t.term} <b>{t.count}</b></span>
                ))}
              </div>
            </DashboardCard>
          </div>

          <DashboardCard title="Extracted text" description={result.truncated ? "Cleaned text (first 50,000 characters analysed) — shown here only, never stored" : "Cleaned text — shown here only, never stored"}>
            <pre className="bg-muted/40 max-h-80 overflow-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap">{result.extracted_text}</pre>
          </DashboardCard>
        </>
      )}

      <DashboardCard title="Recent analyses" description="Metadata only — report text is never saved">
        {!history.data?.length ? (
          <EmptyState title="No reports yet" description="Upload a report to see it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr><th className="py-2">File</th><th>Type</th><th>Size</th><th>Status</th><th>Entities</th><th>Risk factors</th><th>Confidence</th><th>Date</th></tr>
              </thead>
              <tbody>
                {history.data.map((r) => (
                  <tr key={r.id} className="border-border/60 border-t">
                    <td className="max-w-48 truncate py-2">{r.file_name}</td>
                    <td className="uppercase">{r.file_type}</td>
                    <td>{formatBytes(r.file_size_bytes)}</td>
                    <td className={r.status === "failed" ? "text-destructive" : "text-success"}>{r.status}</td>
                    <td>{r.entity_count ?? "—"}</td>
                    <td>{r.risk_factor_count ?? "—"}</td>
                    <td>{r.confidence != null ? `${r.confidence}%` : "—"}</td>
                    <td className="text-muted-foreground text-xs">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
