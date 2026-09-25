import { planBrevoContactSync, type BrevoContactSnapshot, type ContactSyncInput, type ContactSyncPlan } from "./brevo-contact-plan";

type Target = Pick<ContactSyncInput, "tenantId" | "personId">;
type Options = {
  enabled?: boolean;
  accountTenantId: string;
  apiKey?: string;
  /** Must read current permissions through an authorized server context. */
  readPerson: (target: Target) => Promise<ContactSyncInput | null>;
  transport?: typeof fetch;
};
type Result =
  | { status: "disabled" | "created" | "suppressed"; contactId?: number }
  | { status: "blocked" | "skipped" | "failed" | "write_outcome_unknown"; reason: string };
const identity = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Server integration primitive; deliberately not connected to any route or cron. */
export async function syncBrevoContact(requestedTarget: Target, options: Options): Promise<Result> {
  const target = { ...requestedTarget };
  if (options.enabled !== true) return { status: "disabled" };
  if (![target.tenantId, target.personId, options.accountTenantId].every(id => identity.test(id))) {
    return { status: "blocked", reason: "invalid_identity" };
  }
  if (target.tenantId.toLowerCase() !== options.accountTenantId.toLowerCase()) {
    return { status: "blocked", reason: "tenant_mismatch" };
  }
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return { status: "blocked", reason: "missing_configuration" };
  const externalId = `atlas:${target.tenantId.toLowerCase()}:${target.personId.toLowerCase()}`;
  const transport = options.transport ?? fetch;
  const request = (path: string, method = "GET", body?: Record<string, string | boolean>) => transport(`https://api.brevo.com${path}`, {
    method, headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000)
  });
  async function readCurrent() {
    const person = await options.readPerson({ ...target });
    if (!person || person.tenantId.toLowerCase() !== target.tenantId.toLowerCase() || person.personId.toLowerCase() !== target.personId.toLowerCase()) throw new Error("invalid_source");
    return person;
  }
  async function lookup(value: string, type: "ext_id" | "email_id"): Promise<BrevoContactSnapshot | null> {
    const response = await request(`/v3/contacts/${encodeURIComponent(value)}?identifierType=${type}`);
    const body: unknown = await response.json();
    if (response.status === 404 && object(body) && body.code === "document_not_found") return null;
    if (response.status !== 200 || !object(body) || !validId(body.id)
      || (body.email !== undefined && typeof body.email !== "string")
      || typeof body.emailBlacklisted !== "boolean" || typeof body.smsBlacklisted !== "boolean") throw new Error("lookup_failed");
    // The ext_id lookup is authoritative even when the provider omits ext_id
    // from its response. A contradictory value must never be accepted.
    if (type === "ext_id" && body.ext_id !== undefined && body.ext_id !== value) throw new Error("identity_conflict");
    return { id: body.id, email: body.email as string | undefined,
      ext_id: type === "ext_id" ? value : undefined,
      emailBlacklisted: body.emailBlacklisted, smsBlacklisted: body.smsBlacklisted };
  }
  let plan: ContactSyncPlan;
  let existing: BrevoContactSnapshot | null;
  try {
    await readCurrent();
    existing = await lookup(externalId, "ext_id");
    const current = await readCurrent();
    plan = planBrevoContactSync(current, options.accountTenantId, existing);
    if (plan.action === "create") {
      if (await lookup(String(plan.request.body.email), "email_id")) return { status: "blocked", reason: "email_collision" };
      // Permissions may have changed while checking the email collision.
      const refreshed = planBrevoContactSync(await readCurrent(), options.accountTenantId, existing);
      if (JSON.stringify(refreshed) !== JSON.stringify(plan)) return { status: "blocked", reason: "source_changed" };
    }
  } catch {
    return { status: "failed", reason: "source_or_lookup_failed" };
  }
  if (plan.action === "blocked") return { status: "blocked", reason: plan.reason };
  if (plan.action === "skip") return { status: "skipped", reason: plan.reason };
  try {
    const response = await request(plan.request.path, plan.request.method, plan.request.body);
    if (plan.action === "suppress" && response.status === 204) return { status: "suppressed", contactId: existing!.id };
    if (plan.action === "create" && response.status === 201) {
      const body: unknown = await response.json();
      if (object(body) && validId(body.id)) return { status: "created", contactId: body.id };
    }
    if (response.status >= 400 && response.status < 500) return { status: "failed", reason: "provider_rejected" };
    return { status: "write_outcome_unknown", reason: "reconcile_before_retry" };
  } catch {
    // A network failure after a write does not prove the write was rejected.
    return { status: "write_outcome_unknown", reason: "reconcile_before_retry" };
  }
}
