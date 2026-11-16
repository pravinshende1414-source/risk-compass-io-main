<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Cardiovascular and diabetes risk come from logistic-regression weights trained offline (/tmp script, public datasets) and stored in src/lib/ml-models.json; inference in ml-model.server.ts. Why: reproducible, auditable, no runtime training. Other conditions keep published equations.
- The Python FastAPI ML backend is called only from src/services/predictionService.ts (VITE_ML_API_URL, POST /api/predict, GET /health). Why: one swappable client; when unreachable the UI shows labelled demo mode using built-in models.
- NLP reports: text extraction runs in the browser (pdfjs/mammoth), analysis via POST /api/nlp/analyze on the FastAPI backend with in-app rule-based fallback (nlp.functions.ts); nlp_reports stores metadata only, never report text. Why: minimise stored sensitive data.
