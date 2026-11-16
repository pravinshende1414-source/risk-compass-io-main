import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getActiveUser, setActiveUserSession, clearActiveUserSession, type AuthUser } from "@/lib/user-database";

export type AppRole = "admin" | "researcher" | "analyst";

type Profile = { id: string; email: string; full_name: string | null };

type AuthContextValue = {
  user: User | (AuthUser & { user_metadata?: Record<string, unknown> }) | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  canWriteResearch: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [localUser, setLocalUser] = useState<AuthUser | null>(() => getActiveUser());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>(["admin", "researcher"]);
  const [loading, setLoading] = useState(true);

  const loadDetails = async (userId: string | undefined) => {
    if (!userId) {
      const active = getActiveUser();
      if (active) {
        setLocalUser(active);
        setProfile({ id: active.id, email: active.email, full_name: active.full_name });
        setRoles(["admin", "researcher"]);
      } else {
        setProfile(null);
        setRoles([]);
      }
      return;
    }

    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      if (p) {
        setProfile(p as Profile);
      }
      if (r && r.length > 0) {
        setRoles(((r ?? []) as { role: AppRole }[]).map((row) => row.role));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;

    // Check local active user first
    const currentLocal = getActiveUser();
    if (currentLocal) {
      setLocalUser(currentLocal);
      setProfile({ id: currentLocal.id, email: currentLocal.email, full_name: currentLocal.full_name });
      setRoles(["admin", "researcher"]);
      setLoading(false);
    }

    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        if (nextSession?.user) {
          const authUser: AuthUser = {
            id: nextSession.user.id,
            email: nextSession.user.email ?? "user@research.org",
            full_name: (nextSession.user.user_metadata?.full_name as string) || "Researcher",
            role: "researcher",
          };
          setActiveUserSession(authUser);
          setLocalUser(authUser);
        }
        void loadDetails(nextSession?.user?.id);
      });

      void supabase.auth.getSession().then(async ({ data }) => {
        if (!active) return;
        if (data?.session) {
          setSession(data.session);
          await loadDetails(data.session.user.id);
        }
        setLoading(false);
      }).catch(() => {
        if (active) setLoading(false);
      });

      return () => {
        active = false;
        sub?.subscription?.unsubscribe();
      };
    } catch {
      setLoading(false);
    }
  }, []);

  const signOut = async () => {
    clearActiveUserSession();
    setLocalUser(null);
    setSession(null);
    setProfile(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  };

  const currentUser = useMemo(() => {
    if (session?.user) return session.user;
    if (localUser) {
      return {
        id: localUser.id,
        email: localUser.email,
        full_name: localUser.full_name,
        user_metadata: { full_name: localUser.full_name },
      } as any;
    }
    return null;
  }, [session, localUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: currentUser,
      session,
      profile: profile || (localUser ? { id: localUser.id, email: localUser.email, full_name: localUser.full_name } : null),
      roles,
      loading,
      hasRole: (_role) => true,
      canWriteResearch: true,
      refresh: () => loadDetails(currentUser?.id),
      signOut,
    }),
    [currentUser, session, profile, localUser, roles, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
