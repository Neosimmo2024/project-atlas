import type { BrevoContactSnapshot, ContactSyncInput } from "./brevo-contact-plan";

type Target = Pick<ContactSyncInput, "tenantId" | "personId">;
type Attempt = Target & { id: string; status: string };
type Observation = { kind: "found"; contact: BrevoContactSnapshot } | { kind: "absent" | "unknown" };
type Options = {
  enabled?: boolean;
  accountTenantId: string;
  /** Both readers must enforce the current owner/admin session and tenant. */
  readAttempt: (id: string) => Promise<Attempt | null>;
  readPerson: (target: Target) => Promise<ContactSyncInput | null>;
  /** Trusted server reader: fresh exact ext_id lookup, never email adoption. */
  observeContact: (externalId: string) => Promise<Observation>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unresolved = (status: string) => status === "pending" || status === "write_outcome_unknown";

/** Read-only assessment. Never writes to Brevo, releases a journal lock or authorizes retry. */
export async function assessBrevoContactReconciliation(attemptId: string, options: Options) {
  const result = (status: string) => ({ status, retryAllowed: false as const });
  if (options.enabled !== true) return result("disabled");
  if (!uuid.test(attemptId) || !uuid.test(options.accountTenantId)) return result("invalid_identity");
  try {
    const attempt = await options.readAttempt(attemptId);
    if (!attempt || attempt.id !== attemptId || !uuid.test(attempt.tenantId) || !uuid.test(attempt.personId)
      || attempt.tenantId.toLowerCase() !== options.accountTenantId.toLowerCase()) return result("unauthorized_attempt");
    if (!unresolved(attempt.status)) return result("attempt_already_final");
    const target = { tenantId: attempt.tenantId, personId: attempt.personId };
    const matches = (p: ContactSyncInput | null): p is ContactSyncInput => !!p
      && p.tenantId.toLowerCase() === target.tenantId.toLowerCase()
      && p.personId.toLowerCase() === target.personId.toLowerCase();
    const person = await options.readPerson(target);
    if (!matches(person)) return result("unauthorized_source");
    const snapshot = JSON.stringify(person);
    const attemptSnapshot = JSON.stringify(attempt);
    const externalId = `atlas:${target.tenantId.toLowerCase()}:${target.personId.toLowerCase()}`;
    const observation = await options.observeContact(externalId);
    const currentAttempt = await options.readAttempt(attemptId);
    const currentPerson = await options.readPerson(target);
    if (!currentAttempt || JSON.stringify(currentAttempt) !== attemptSnapshot
      || !matches(currentPerson) || JSON.stringify(currentPerson) !== snapshot) return result("source_changed");
    // Absence now does not prove an earlier write failed; pending work can still complete.
    if (observation.kind !== "found") return result("outcome_unresolved");
    const c = observation.contact;
    if (!Number.isSafeInteger(c.id) || c.id <= 0 || c.ext_id !== externalId
      || typeof c.emailBlacklisted !== "boolean" || typeof c.smsBlacklisted !== "boolean") return result("identity_or_state_unverified");
    if (!currentPerson.contactAllowed || currentPerson.doNotContact) {
      return result(c.emailBlacklisted && c.smsBlacklisted ? "suppression_observed_review_required" : "suppression_required");
    }
    if (!currentPerson.email?.trim() || typeof c.email !== "string"
      || currentPerson.email.trim().toLowerCase() !== c.email.trim().toLowerCase()) return result("email_change_requires_review");
    // Matching current state is an observation, not proof of which attempt wrote it.
    return result("linked_contact_observed_review_required");
  } catch {
    return result("verification_failed");
  }
}
