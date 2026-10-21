import { syncBrevoContact } from "./brevo-contact-sync";
import type { ContactSyncInput } from "./brevo-contact-plan";

export type ContactSyncResult = Awaited<ReturnType<typeof syncBrevoContact>>;
type Target = Pick<ContactSyncInput, "tenantId" | "personId">;
export type ContactSyncJournal = {
  begin: (target: Target) => Promise<string>;
  finish: (attemptId: string, result: ContactSyncResult) => Promise<void>;
};

/** Prepared server boundary; no route, cron or environment activation. */
export async function syncBrevoContactWithJournal(target: Target,
  options: Parameters<typeof syncBrevoContact>[1] & { journal: ContactSyncJournal }) {
  if (options.enabled !== true) return { status: "disabled" } as const;
  const boundTarget = { ...target };
  let attemptId: string;
  try {
    // Must persist the pending row before even a provider lookup.
    attemptId = await options.journal.begin(boundTarget);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)) throw new Error("invalid_attempt");
  } catch {
    return { status: "blocked", reason: "journal_unavailable_or_unresolved" } as const;
  }
  let result: ContactSyncResult;
  try {
    result = await syncBrevoContact(boundTarget, options);
  } catch {
    result = { status: "write_outcome_unknown", reason: "reconcile_before_retry" };
  }
  try {
    await options.journal.finish(attemptId, result);
  } catch {
    // The pending row remains locked. Do not report completion or retry the write.
    return { status: "write_outcome_unknown", reason: "journal_completion_failed", attemptId } as const;
  }
  return { ...result, attemptId };
}
