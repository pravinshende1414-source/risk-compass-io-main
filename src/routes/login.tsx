import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { loginLocalUser } from "@/lib/user-database";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — HealthRisk AI" },
      {
        name: "description",
        content: "Sign in to the HealthRisk AI educational research workspace.",
      },
      { property: "og:title", content: "Log in — HealthRisk AI" },
      { property: "og:description", content: "Sign in to the HealthRisk AI research workspace." },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data);
      if (!signInError) {
        setLoading(false);
        void logAudit("auth.sign_in");
        toast.success("Signed in");
        navigate({ to: "/dashboard" });
        return;
      }
    } catch {
      // Supabase unavailable, proceed with user-isolated local database
    }

    const localUser = loginLocalUser({ email: parsed.data.email, password: parsed.data.password });
    setLoading(false);
    void logAudit("auth.sign_in");
    toast.success(`Signed in as ${localUser.full_name}`);
    navigate({ to: "/dashboard" });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your research workspace."
      footer={
        <>
          New here?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@research.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
