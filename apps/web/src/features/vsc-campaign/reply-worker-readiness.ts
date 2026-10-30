/**
 * VSC reply processing must not be enabled until the database-backed
 * cancellation and IMAP worker have passed integration checks.
 * This module only calculates readiness, never executes the worker.
 */
export type VscReplyWorkerReadiness = {
  mailboxConfigured: boolean;
  imapRoundtripPassed: boolean;
  outboundMessageIdsPersisted: boolean;
  replyJournalMigrationApplied: boolean;
  cancellationRpcTested: boolean;
  tenantIsolationVerified: boolean;
  idempotencyVerified: boolean;
};

export function canEnableVscReplyWorker(input: VscReplyWorkerReadiness): boolean {
  return Object.values(input).every(value => value === true);
}
