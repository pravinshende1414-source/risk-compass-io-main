import { supabase } from "@/integrations/supabase/client";

/** Best-effort audit trail write. Never throws — auditing must not block a user action. */
export async function logAudit(action: string, details?: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("audit_logs").insert({
      user_id: data.user.id,
      action,
      details: (details ?? null) as never,
    });
  } catch {
    // ignore
  }
}
