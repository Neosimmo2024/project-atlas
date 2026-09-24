/** Pure planning only: no database, credentials, network or automatic activation. */
export type ContactSyncInput = {
  tenantId: string;
  personId: string;
  email: string | null;
  contactAllowed: boolean;
  doNotContact: boolean;
};

export type BrevoContactSnapshot = {
  id: number;
  ext_id?: string | null;
  email?: string | null;
  emailBlacklisted?: boolean;
  smsBlacklisted?: boolean;
};

type ContactWrite = {
  method: "POST" | "PUT";
  path: string;
  body: Record<string, string | boolean>;
};

export type ContactSyncPlan =
  | { action: "blocked"; reason: "tenant_mismatch" | "invalid_identity" | "invalid_email" | "invalid_contact" | "identity_conflict" | "email_change_requires_review" }
  | { action: "skip"; reason: "contact_not_allowed" | "already_linked" | "already_blocklisted" }
  | { action: "create" | "suppress"; externalId: string; request: ContactWrite };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeEmail = (value: string) => value.trim().toLowerCase();

/**
 * accountTenantId must come from trusted server configuration, not request data.
 * existing must be a freshly read Brevo contact matched by ext_id AND checked for
 * email collisions before execution. A plan alone never authorizes a live write.
 */
export function planBrevoContactSync(
  input: ContactSyncInput,
  accountTenantId: string,
  existing: BrevoContactSnapshot | null
): ContactSyncPlan {
  if (!uuid.test(input.tenantId) || !uuid.test(input.personId) || !uuid.test(accountTenantId)) {
    return { action: "blocked", reason: "invalid_identity" };
  }
  if (input.tenantId.toLowerCase() !== accountTenantId.toLowerCase()) {
    return { action: "blocked", reason: "tenant_mismatch" };
  }
  const externalId = `atlas:${input.tenantId.toLowerCase()}:${input.personId.toLowerCase()}`;
  const allowed = input.contactAllowed === true && input.doNotContact === false;

  if (existing) {
    if (!Number.isSafeInteger(existing.id) || existing.id <= 0) {
      return { action: "blocked", reason: "invalid_contact" };
    }
    if (existing.ext_id !== externalId) {
      return { action: "blocked", reason: "identity_conflict" };
    }
    // Apply a restriction to the known identity even if its email has changed.
    if (!allowed) {
      if (existing.emailBlacklisted === true && existing.smsBlacklisted === true) {
        return { action: "skip", reason: "already_blocklisted" };
      }
      return {
        action: "suppress", externalId,
        request: { method: "PUT", path: `/v3/contacts/${existing.id}?identifierType=contact_id`,
          body: { emailBlacklisted: true, smsBlacklisted: true } }
      };
    }
  } else if (!allowed) {
    return { action: "skip", reason: "contact_not_allowed" };
  }

  const email = normalizeEmail(input.email ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { action: "blocked", reason: "invalid_email" };
  }
  if (existing) {
    // Never change EMAIL or write a blacklist flag to false: either could
    // override an opt-out. Existing suppression remains authoritative.
    if (normalizeEmail(existing.email ?? "") !== email) {
      return { action: "blocked", reason: "email_change_requires_review" };
    }
    return { action: "skip", reason: "already_linked" };
  }
  return {
    action: "create", externalId,
    request: { method: "POST", path: "/v3/contacts",
      body: { email, ext_id: externalId, updateEnabled: false, forceMerge: false } }
  };
}
