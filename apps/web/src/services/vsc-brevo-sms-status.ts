/** Read-only account identity check. No campaign, contact, webhook or send mutations. */
export type VscBrevoSmsStatus = { state: "missing_key" | "identity_verified" | "identity_mismatch" | "unavailable"; dispatchEnabled: false };
export async function inspectVscBrevoSmsAccount(tenantId: string): Promise<VscBrevoSmsStatus> {
  if (!tenantId || tenantId !== process.env.VSC_OVH_TENANT_ID?.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId))
    throw new Error("Entreprise non autorisée");
  // Never reuse BREVO_API_KEY, which belongs to the separate recruitment integration.
  const key = process.env.VSC_BREVO_API_KEY?.trim();
  if (!key) return { state: "missing_key", dispatchEnabled: false };
  try {
    const response = await fetch("https://api.brevo.com/v3/account", {
      method: "GET", headers: { "api-key": key, accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { state: "unavailable", dispatchEnabled: false };
    const data = await response.json();
    if (typeof data?.email !== "string" || !data.email.trim()) return { state: "unavailable", dispatchEnabled: false };
    return { state: data.email.trim().toLowerCase() === "contact@vendresoncommerce.com" ? "identity_verified" : "identity_mismatch", dispatchEnabled: false };
  } catch { return { state: "unavailable", dispatchEnabled: false }; }
}
