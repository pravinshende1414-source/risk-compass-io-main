import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Brain, FileText, HeartPulse, LineChart, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { DisclaimerBanner } from "@/components/app/DisclaimerBanner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HealthRisk AI — Understand Health Data. Predict Risk. Explain AI." },
      {
        name: "description",
        content:
          "HealthRisk AI is an educational research platform for exploring synthetic health data, risk modelling and explainable machine learning.",
      },
      {
        property: "og:title",
        content: "HealthRisk AI — Understand Health Data. Predict Risk. Explain AI.",
      },
      {
        property: "og:description",
        content: "Educational research platform for synthetic health data and explainable ML.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Brain,
    title: "Explainable by design",
    body: "Every planned estimate is paired with attribution views so the reasoning stays inspectable.",
  },
  {
    icon: LineChart,
    title: "Risk & Cohort Insights",
    body: "Explore patient cohorts, risk assessments and clinical predictions.",
  },
  {
    icon: FileText,
    title: "NLP report analysis",
    body: "Structure unstructured research notes with entity extraction and summarisation.",
  },
  {
    icon: ShieldCheck,
    title: "Research-safe data",
    body: "Only synthetic or anonymized records — never real clinical decision-making.",
  },
];

function Landing() {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/70 sticky top-0 z-30 border-b backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard">Open workspace</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="bg-surface-gradient relative overflow-hidden">
          <div className="bg-primary/15 pointer-events-none absolute -top-32 -right-24 size-96 rounded-full blur-3xl" />
          <div className="bg-accent/15 pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <span className="border-primary/25 bg-primary-soft text-primary inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
              <HeartPulse className="size-3.5" /> Educational &amp; research platform
            </span>
            <h1 className="font-display mt-6 max-w-3xl text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-6xl">
              Understand Health Data.
              <br />
              <span className="text-gradient-brand">Predict Risk. Explain AI.</span>
            </h1>
            <p className="text-muted-foreground mt-5 max-w-xl text-base leading-relaxed">
              A full-stack data science workspace for studying synthetic and anonymized health data —
              cohort analytics, risk modelling scaffolding and interpretability tooling in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/dashboard">
                  Explore the workspace <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/register">Create an account</Link>
              </Button>
            </div>
            <DisclaimerBanner className="bg-card/80 mt-10 max-w-3xl" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-semibold">What the platform covers</h2>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm">
            Twelve modules scaffolded end to end. Modelling logic arrives in the next build phase.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <article key={f.title} className="card-surface hover:shadow-lift p-5 hover:-translate-y-1">
                <span className="bg-primary-soft text-primary flex size-10 items-center justify-center rounded-xl">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{f.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto max-w-6xl px-4 py-8 text-xs sm:px-6">
          © {new Date().getFullYear()} HealthRisk AI · Educational and research use only.
        </div>
      </footer>
    </div>
  );
}
