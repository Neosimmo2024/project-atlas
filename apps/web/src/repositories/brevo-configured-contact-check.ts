import "server-only";
import { verifyBrevoAccountBinding } from "@/services/brevo-account-binding";
import { inspectAndRecordBrevoContactAttempt } from "./brevo-contact-check";
import { getTenantContext } from "./tenant-context";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prepared QA entry point, not a Server Action or route. Only the attempt ID
 * may come from a caller; account identity, tenant and key are server-owned.
 * Enabling checks never enables sync, writes to Brevo, or unlocks an attempt.
 */
export async function inspectConfiguredBrevoContactAttempt(attemptId: string) {
  const fail = (status: string) => ({ status, recorded: false as const, retryAllowed: false as const });
  if (process.env.ATLAS_BREVO_CONTACT_CHECK_ENABLED !== "1") return fail("disabled");
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "preview"
    || process.env.VERCEL_PROJECT_ID !== "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
    || process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://mahgxumwucxehsooijag.supabase.co") return fail("scope_rejected");
  if (!uuid.test(attemptId)) return fail("invalid_identity");
  const accountTenantId = process.env.ATLAS_BREVO_CONTACT_TENANT_ID ?? "";
  const expectedOrganizationId = process.env.ATLAS_BREVO_ORGANIZATION_ID ?? "";
  const apiKey = process.env.BREVO_API_KEY;
  if (!uuid.test(accountTenantId)) return fail("binding_unconfigured");
  try {
    const actor = await getTenantContext();
    if (!actor || !["owner", "admin"].includes(actor.role)
      || actor.tenantId.toLowerCase() !== accountTenantId.toLowerCase()) return fail("unauthorized_attempt");
    const binding = await verifyBrevoAccountBinding(actor.tenantId, {
      enabled: true, accountTenantId, expectedOrganizationId, apiKey,
    });
    if (binding.status !== "verified") return fail(binding.status);
    const current = await getTenantContext();
    if (!current || !["owner", "admin"].includes(current.role)
      || current.tenantId !== actor.tenantId || current.userId !== actor.userId) return fail("unauthorized_attempt");
    return await inspectAndRecordBrevoContactAttempt(attemptId, {
      enabled: true, accountTenantId, apiKey,
    });
  } catch { return fail("verification_failed"); }
}
