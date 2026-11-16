import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { explainPatientRisk } from "@/lib/explain.functions";

function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} className="h-2" />;
    const h = t.match(/^#{1,6}\s+(.*)$/);
    const clean = (s: string) => s.replace(/\*\*(.*?)\*\*/g, "$1");
    if (h) return <h4 key={i} className="font-display mt-3 text-sm font-semibold">{clean(h[1] ?? "")}</h4>;
    if (/^[-*]\s+/.test(t)) return <li key={i} className="ml-5 list-disc text-sm">{clean(t.replace(/^[-*]\s+/, ""))}</li>;
    return <p key={i} className="text-sm leading-relaxed">{clean(t)}</p>;
  });
}

export function ExplainPanel({ patientId }: { patientId: string }) {
  const explain = useServerFn(explainPatientRisk);
  const [context, setContext] = useState("");
  const mutation = useMutation({
    mutationFn: () => explain({ data: { patientId, context } }),
  });

  return (
    <div className="border-border mt-6 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary size-4" />
        <p className="font-display text-sm font-semibold">Plain-language AI explanation</p>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        Educational only — explains what the published scores mean, which inputs drove them, and their limitations. Not medical advice.
      </p>
      <Textarea
        className="mt-3"
        rows={3}
        maxLength={2000}
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Optional extra health context (e.g. synthetic note: on statin therapy, recent weight loss)"
        aria-label="Additional health context"
      />
      <Button className="mt-3" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        <Sparkles className="size-4" />
        {mutation.isPending ? "Writing explanation…" : "Explain these scores"}
      </Button>
      {mutation.isError && (
        <p className="text-destructive mt-3 text-sm">
          {mutation.error instanceof Error ? mutation.error.message : "Something went wrong."}
        </p>
      )}
      {mutation.data && (
        <div className="bg-muted/40 mt-4 rounded-lg p-4">
          {renderMarkdown(mutation.data.explanation)}
          <p className="text-muted-foreground mt-3 text-xs">Generated with Lovable AI · synthetic data · not a diagnosis</p>
        </div>
      )}
    </div>
  );
}
