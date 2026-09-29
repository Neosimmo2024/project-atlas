import "server-only";
import { getTenantContext } from "./tenant-context";

const qaTenant = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
// Independently confirmed by Renato and the signed-in Brevo profile on 28/09.
const expectedLogin = "contact@neos-immo.com";

export function isBrevoQaScope() {
  return process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_PROJECT_ID === "prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon"
    && process.env.NEXT_PUBLIC_SUPABASE_URL === "https://mahgxumwucxehsooijag.supabase.co";
}

/** Explicit owner-only diagnostic. Never saves an identity or changes a setting.
 * Matching the independently known login is bootstrap evidence, not activation.
 */
export async function diagnoseBrevoQaAccount() {
  if (!isBrevoQaScope()) return { status: "scope_rejected" } as const;
  try {
    const actor = await getTenantContext();
    if (!actor || actor.role !== "owner" || actor.tenantId !== qaTenant) return { status: "forbidden" } as const;
    const key = process.env.BREVO_API_KEY?.trim();
    if (!key) return { status: "missing_configuration" } as const;
    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET", headers: { "api-key": key, accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200) { await response.body?.cancel(); return { status: "unavailable" } as const; }
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)
      || !("email" in body) || typeof body.email !== "string"
      || !("organization_id" in body) || typeof body.organization_id !== "string"
      || !/^[A-Za-z0-9_-]{1,128}$/.test(body.organization_id)) return { status: "unavailable" } as const;
    const fresh = await getTenantContext();
    if (!fresh || fresh.role !== "owner" || fresh.tenantId !== actor.tenantId || fresh.userId !== actor.userId) return { status: "forbidden" } as const;
    if (body.email.trim().toLowerCase() !== expectedLogin) return { status: "account_mismatch" } as const;
    // Only the non-secret organization ID leaves this boundary. No response logs.
    return { status: "account_identified", organizationId: body.organization_id,
      bindingMatches: process.env.ATLAS_BREVO_ORGANIZATION_ID === body.organization_id
        && process.env.ATLAS_BREVO_CONTACT_TENANT_ID === qaTenant } as const;
  } catch { return { status: "unavailable" } as const; }
}

export function brevoContactCommandAvailability() {
  const configured = isBrevoQaScope() && process.env.ATLAS_BREVO_CONTACT_TENANT_ID === qaTenant
    && /^[A-Za-z0-9_-]{1,128}$/.test(process.env.ATLAS_BREVO_ORGANIZATION_ID ?? "")
    && !!process.env.BREVO_API_KEY?.trim();
  const checks = configured && process.env.ATLAS_BREVO_CONTACT_CHECK_ENABLED === "1";
  return { checks, reviews: checks && process.env.ATLAS_BREVO_CONTACT_REVIEW_ENABLED === "1" };
}
