import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { registerLocalUser } from "@/lib/user-database";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — HealthRisk AI" },
      {
        name: "description",
        content: "Create a HealthRisk AI account to explore synthetic health data research tools.",
      },
      { property: "og:title", content: "Create account — HealthRisk AI" },
      {
        property: "og:description",
        content: "Join the HealthRisk AI educational research platform.",
      },
    ],
  }),
  component: RegisterPage,
});

const schema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ fullName, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: parsed.data.fullName },
        },
      });
      if (!signUpError && data?.session) {
        setLoading(false);
        toast.success("Account created");
        navigate({ to: "/dashboard" });
        return;
      }
    } catch {
      // Supabase is offline, proceed with local account
    }

    const localUser = registerLocalUser({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);
    toast.success(`Account created for ${localUser.full_name}`);
    navigate({ to: "/dashboard" });
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up access to the HealthRisk AI research workspace."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="border-border rounded-lg border p-4 text-sm">
          <p className="font-medium">Check your email</p>
          <p className="text-muted-foreground mt-1">
            We sent a confirmation link to {email}. Confirm it to activate your workspace access.
          </p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              placeholder="Jane Researcher"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
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
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
          <p className="text-muted-foreground text-xs">
            New accounts receive the Analyst role by default (read-only research access).
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
