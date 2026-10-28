import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assessBrevoContactReconciliation } from "@/services/brevo-contact-reconciliation";
import { createBrevoContactObserver } from "@/services/brevo-contact-observer";
import { createAuthorizedBrevoContactSource } from "./brevo-contact-source";
import { getTenantContext } from "./tenant-context";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server composition only. Options must be supplied by trusted server configuration, never request JSON. */
export async function inspectAuthorizedBrevoContactAttempt(attemptId: string, options: {
  enabled?: boolean; accountTenantId: string; apiKey?: string; transport?: typeof fetch;
}) {
  const fail = (status: string) => ({ status, retryAllowed: false as const });
  if (options.enabled !== true) return fail("disabled");
  if (!uuid.test(attemptId) || !uuid.test(options.accountTenantId)) return fail("invalid_identity");
  try {
    const initial = await getTenantContext();
    if (!initial || !["owner", "admin"].includes(initial.role) || initial.tenantId.toLowerCase() !== options.accountTenantId.toLowerCase()) return fail("unauthorized_attempt");
    const readAttempt = async (id: string) => {
      if (id !== attemptId) throw new Error("unavailable");
      const current = await getTenantContext();
      if (!current || !["owner", "admin"].includes(current.role) || current.tenantId !== initial.tenantId || current.userId !== initial.userId) throw new Error("unavailable");
      const db = await createSupabaseServerClient();
      const { data, error } = await db.from("brevo_contact_sync_attempts").select("id, tenant_id, person_id, status")
        .eq("tenant_id", initial.tenantId).eq("id", attemptId).maybeSingle();
      if (error) throw new Error("unavailable");
      if (!data) return null;
      if (data.id !== attemptId || data.tenant_id !== initial.tenantId || !uuid.test(data.person_id) || typeof data.status !== "string") throw new Error("unavailable");
      return { id: data.id, tenantId: data.tenant_id, personId: data.person_id, status: data.status };
    };
    const attempt = await readAttempt(attemptId);
    if (!attempt) return fail("unauthorized_attempt");
    const source = await createAuthorizedBrevoContactSource(attempt.personId);
    if (source.target.tenantId !== initial.tenantId) return fail("unauthorized_source");
    return await assessBrevoContactReconciliation(attemptId, {
      enabled: true, accountTenantId: initial.tenantId, readAttempt, readPerson: source.readPerson,
      observeContact: createBrevoContactObserver(options)
    });
  } catch { return fail("verification_failed"); }
}
