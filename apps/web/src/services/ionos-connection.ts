import type { TenantContext } from "@/types/domain";

export const IONOS_SENDER = "contact@lesformateursimmo.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** LFI tenant access gate retained for the IONOS incoming mailbox. */
export function canManageIonos(context: TenantContext) {
  const tenantId = process.env.LFI_IONOS_TENANT_ID?.trim();
  return !!tenantId && UUID.test(tenantId) && context.tenantId === tenantId &&
    (context.role === "owner" || context.role === "admin");
}
