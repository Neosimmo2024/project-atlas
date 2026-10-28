import "server-only";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const organization = /^[A-Za-z0-9_-]{1,128}$/;
type Options = {
  enabled?: boolean;
  accountTenantId: string;
  expectedOrganizationId: string;
  apiKey?: string;
  transport?: typeof fetch;
};

/** Trusted server configuration only. Never learns or updates the expected identity
 * from the response. No cache: every operation verifies the current credential.
 */
export async function verifyBrevoAccountBinding(tenantId: string, options: Options) {
  if (options.enabled !== true) return { status: "disabled" } as const;
  // Capture configuration before awaiting; subsequent calls use the same key.
  const accountTenantId = options.accountTenantId;
  const expectedOrganizationId = options.expectedOrganizationId;
  const apiKey = options.apiKey?.trim();
  if (!uuid.test(tenantId) || !uuid.test(accountTenantId)
    || tenantId.toLowerCase() !== accountTenantId.toLowerCase()) return { status: "tenant_mismatch" } as const;
  if (!organization.test(expectedOrganizationId) || !apiKey) return { status: "binding_unconfigured" } as const;
  try {
    const response = await (options.transport ?? fetch)("https://api.brevo.com/v3/account", {
      method: "GET", headers: { "api-key": apiKey, accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return { status: "account_unverified" } as const;
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)
      || !("organization_id" in data) || typeof data.organization_id !== "string"
      || !organization.test(data.organization_id)) return { status: "account_unverified" } as const;
    if (data.organization_id !== expectedOrganizationId) return { status: "account_mismatch" } as const;
    // Account responses can include personal details and an automation key.
    // Never return, persist or log the response, even on mismatch.
    return { status: "verified" } as const;
  } catch { return { status: "account_unverified" } as const; }
}
