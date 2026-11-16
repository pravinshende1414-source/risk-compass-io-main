import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { DisclaimerBanner } from "./DisclaimerBanner";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="bg-brand-gradient text-primary-foreground relative hidden flex-col justify-between p-10 lg:flex">
        <Link to="/" aria-label="HealthRisk AI home">
          <Logo />
        </Link>
        <div>
          <h2 className="font-display text-3xl leading-tight font-semibold">
            Understand Health Data.
            <br />
            Predict Risk. Explain With AI.
          </h2>
          <p className="mt-4 max-w-sm text-sm opacity-90">
            A research workspace for synthetic health datasets, risk modelling and interpretable machine
            learning.
          </p>
        </div>
        <p className="text-xs opacity-80">Educational and research use only.</p>
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <Link to="/" aria-label="HealthRisk AI home">
              <Logo />
            </Link>
          </div>
          <h1 className="font-display mt-8 text-2xl font-semibold lg:mt-0">{title}</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>
          <div className="mt-8 space-y-4">{children}</div>
          <div className="text-muted-foreground mt-6 text-sm">{footer}</div>
          <DisclaimerBanner className="mt-8" variant="compact" />
        </div>
      </div>
    </div>
  );
}
