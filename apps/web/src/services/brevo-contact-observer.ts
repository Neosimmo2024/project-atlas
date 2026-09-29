import type { assessBrevoContactReconciliation } from "./brevo-contact-reconciliation";
type Observation = Awaited<ReturnType<Parameters<typeof assessBrevoContactReconciliation>[1]["observeContact"]>>;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const externalIdentity = new RegExp(`^atlas:(${uuid}):(${uuid})$`);
/** Server-only integration primitive. Fixed origin, GET only, no implicit activation. */
export function createBrevoContactObserver(options: { enabled?: boolean; accountTenantId: string; apiKey?: string; transport?: typeof fetch }) {
  return async (externalId: string): Promise<Observation> => {
    const match = externalIdentity.exec(externalId);
    if (options.enabled !== true || !match || match[1] !== options.accountTenantId.toLowerCase() || !options.apiKey?.trim()) return { kind: "unknown" };
    try {
      const response = await (options.transport ?? fetch)(`https://api.brevo.com/v3/contacts/${encodeURIComponent(externalId)}?identifierType=ext_id`, {
        method: "GET", headers: { "api-key": options.apiKey.trim(), accept: "application/json" },
        redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000)
      });
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) return { kind: "unknown" };
      const value = body as Record<string, unknown>;
      if (response.status === 404 && value.code === "document_not_found") return { kind: "absent" };
      if (response.status !== 200 || typeof value.id !== "number" || !Number.isSafeInteger(value.id) || value.id <= 0
        || (value.ext_id !== undefined && value.ext_id !== externalId)
        || (value.email !== undefined && typeof value.email !== "string")
        || typeof value.emailBlacklisted !== "boolean" || typeof value.smsBlacklisted !== "boolean") return { kind: "unknown" };
      // Brevo may omit ext_id in the response: identity derives from the exact typed lookup.
      return { kind: "found", contact: { id: value.id, ext_id: externalId, email: value.email as string | undefined,
        emailBlacklisted: value.emailBlacklisted, smsBlacklisted: value.smsBlacklisted } };
    } catch { return { kind: "unknown" }; }
  };
}
