/** Browser-side text extraction for uploaded reports (PDF, DOCX, TXT). */

export const NLP_ALLOWED = {
  pdf: { mime: ["application/pdf"], label: "PDF" },
  txt: { mime: ["text/plain"], label: "TXT" },
  docx: {
    mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    label: "DOCX",
  },
} as const;
export type NlpFileType = keyof typeof NLP_ALLOWED;
export const NLP_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const NLP_MAX_CHARS = 50_000;

export function validateReportFile(file: File): { ok: true; type: NlpFileType } | { ok: false; error: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(ext in NLP_ALLOWED)) return { ok: false, error: "Unsupported file type. Upload a PDF, TXT or DOCX file." };
  const type = ext as NlpFileType;
  const mimes: readonly string[] = NLP_ALLOWED[type].mime;
  if (file.type && !mimes.includes(file.type)) {
    return { ok: false, error: `The file content does not look like a ${NLP_ALLOWED[type].label} file.` };
  }
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > NLP_MAX_BYTES) return { ok: false, error: "File is larger than the 10 MB limit." };
  return { ok: true, type };
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** Reads the file with real progress events (0-100). */
export function readFileWithProgress(file: File, onProgress: (pct: number) => void): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    r.onload = () => { onProgress(100); resolve(r.result as ArrayBuffer); };
    r.onerror = () => reject(new Error("The file could not be read."));
    r.readAsArrayBuffer(file);
  });
}

export async function extractText(buf: ArrayBuffer, type: NlpFileType): Promise<string> {
  if (type === "txt") return new TextDecoder("utf-8").decode(buf);
  if (type === "docx") {
    const mammoth = await import("mammoth");
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return res.value;
  }
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: unknown) => (typeof it === "object" && it && "str" in it ? String((it as { str: string }).str) : "")).join(" "));
  }
  return pages.join("\n");
}
