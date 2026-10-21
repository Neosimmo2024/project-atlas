import "server-only";
import type { TenantContext } from "@/types/domain";

// Explicit binding: this credential must never fall back to the NEOS key.
export const VSC_TENANT_ID = "f716f14d-7fc8-4e33-a49a-18c6a2367816";
const VSC_EMAIL = "contact@vendresoncommerce.com";
export type VscConnectionStatus = "forbidden" | "unconfigured" | "connected" | "wrong_account" | "unavailable";

/** Read-only account verification. Never return the provider payload: it can
 * contain other credentials. This connection does not enable sending. */
export async function verifyVscConnection(actor: TenantContext | null): Promise<VscConnectionStatus> {
  if (!actor || actor.tenantId !== VSC_TENANT_ID || !["owner", "admin"].includes(actor.role)) return "forbidden";
  const key = process.env.BREVO_VSC_API_KEY?.trim();
  if (!key) return "unconfigured";
  try {
    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET", headers: { "api-key": key, accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return "unavailable";
    const account: unknown = await response.json();
    if (!account || typeof account !== "object" || !("email" in account)
      || typeof account.email !== "string" || account.email.trim().toLowerCase() !== VSC_EMAIL) return "wrong_account";
    return "connected";
  } catch { return "unavailable"; }
}
