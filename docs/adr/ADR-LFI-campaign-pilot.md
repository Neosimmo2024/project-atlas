# LFI campaign pilot — prepared, not activated

The SMTP/IMAP round-trip and signed email were verified on 26 October 2026.
This change adds separate LFI campaigns, recipient snapshots, opaque 256-bit
unsubscribe tokens, suppressions and an outbox. No existing Brevo tables,
provider credentials, mailbox settings or scheduled jobs are replaced.

All new tables/functions are server-only, with RLS and client grants revoked.
The authenticated admin prepares initial email drafts for at most 20 explicit
contact IDs belonging to the configured tenant. The project is fixed to LFI.
Recipients must be real-estate professionals in IDF, permitted for contact,
not rejected/archived, without an LFI suppression. NEOS recruitment sequences and recruitment-email timeline events do not exclude
LFI contacts: participation is independent by company. Shared explicit contact
permission and do-not-contact flags remain enforced, alongside LFI suppressions.

GET unsubscribe is a confirmation page (safe for scanners). POST, including
provider one-click POST, atomically records suppression and cancels queued
follow-ups. The token contains no address and responses do not disclose it.
These public routes are intentionally accessible without an Atlas login.

The atomic claim serializes by tenant/sender, rechecks contact permission,
unchanged email and IDF geography, and requires an active campaign plus a
mailbox scan less than five minutes old. Default throttle: 20/hour, 100/rolling
24 hours, at least three minutes apart. Claimed/uncertain messages consume
quota and are never automatically retried. The sender rechecks suppressions,
contact eligibility and LFI exclusions immediately before SMTP.
A suppression after SMTP has already started cannot recall the in-flight mail.

The mailbox worker uses read-only IMAP and a durable UID/UIDVALIDITY cursor.
Before initial sending it starts at the current end, without importing history.
Subsequent scans process at most 500 UIDs, stop recipients on incoming replies,
and inspect mailer-daemon/postmaster reports for tracked Message-IDs. A partial
or failed scan blocks sending. Reply detection is deliberately conservative:
a new message from an already contacted recipient pauses further solicitation.
Unmatched bounce formats and messages moved outside INBOX require review.

The internal worker POST /api/internal/lfi-campaign uses the existing server
orchestration authentication and handles only this configured LFI project.
No cron has been installed and no campaign is active. The admin UI provides
preparation/review and mailbox checking only, with no launch action.
Before rollout: validate the concrete recipient batch/content/schedule; verify
public unsubscribe on the deployment; configure LFI_CAMPAIGN_PUBLIC_ORIGIN;
connect a three-minute scheduler to the authenticated worker; then enable the
approved pilot. Only first emails are prepared in this version. Webinar date
and link, later message dates/content and registered-contact reconciliation
must be finalized before scheduling those follow-ups. Do not claim all campaign
automation is operational or retire Brevo at this stage.

Validation: unit tests, production build, and transactional SQL tests for draft
and mailbox gating, rejected contacts, atomic claims, duplicate prevention,
suppression cancellation and server-only grants. SQL fixtures roll back.

## Draft preparation controls

Admins can save a future initial-email date before 3 December 2026, while the campaign remains draft. The UI also lets an admin explicitly confirm a selected recipient registration; this uses the existing atomic suppression function and cancels queued messages. This is manual registration reporting, not a synchronization with the training website. No scheduler or activation is enabled by these controls.

## Company separation

A contact may participate in both NEOS IMMO and Les Formateurs Immo campaigns.
LFI selection, draft preparation and dispatch no longer consult recruitment
sequences or recruitment-email events. LFI suppression, registration stops,
duplicate protection, quotas and explicit global contact restrictions remain.
No other company campaign data is changed by this correction.
