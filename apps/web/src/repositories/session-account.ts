import { sessionAccountSummary, type SessionAccountSummary } from "@/features/session-account/session-account";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantContext } from "@/repositories/tenant-context";

export async function getSessionAccountSummary(): Promise<SessionAccountSummary | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, tenantContext] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    getTenantContext()
  ]);

  return sessionAccountSummary({
    fullName: profile?.full_name,
    email: profile?.email ?? user.email,
    tenantName: tenantContext?.tenant.name,
    role: tenantContext?.role
  });
}
