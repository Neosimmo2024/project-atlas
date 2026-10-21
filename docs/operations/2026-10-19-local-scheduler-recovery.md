# Saint-Maur scheduler recovery — 19 October 2026

The deployed worker was not called: an operational SQL guard added for Lyon
returned zero rows whenever a non-Lyon scheduled step existed. On 19 October,
244 runs since 17 October had returned zero rows, despite 80 overdue local steps.

Applied in Atlas QA:

- Restored the existing authenticated pg_net orchestrator call every 15 minutes.
- Preserved contact, overlap, reply and appointment guards in the worker.
- Added an atomic 40-new-contact daily cap in Europe/Paris, including in-flight
  or uncertain attempts. Initial local sends also pause on Sunday and before 09:30.
- Replanned the 205 unsent contacts to 20–24 October (40/day) and 26 October (5),
  each at 09:30 Europe/Paris. Preserved the original approved review and content.
- Restored the pre-send list automation and added a daily post-send check.

Evidence:

- Live SQL regression, rolled back with no HTTP calls: first claim 40, second 0;
  zero persistent attempts after rollback.
- Authenticated deployed orchestrator call returned HTTP 200 with zero errors,
  no due contacts and no prospect email sent during verification.
- A Brevo template test to the owner's existing personal test address was
  confirmed sent and delivered at 15:12 Europe/Paris on 19 October.

The next actual scheduled prospect send remains to be verified after its due time.
The operational recovery is applied, but publishing this commit was rejected by
automatic approval review because the remote repository is public.
