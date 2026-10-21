// Public identifiers only. Credentials must remain in server-only services.
export const NEOS_TENANT_ID = "8e27b0ff-3f1a-41fa-8390-628c718723a2";
export const VSC_TENANT_ID = "f716f14d-7fc8-4e33-a49a-18c6a2367816";
export function isNeosBrevoTenant(tenantId: string | null | undefined) {
  return tenantId === NEOS_TENANT_ID;
}
