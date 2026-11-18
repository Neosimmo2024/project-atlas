# People directory and global search timeout repair

Both errors were reproduced on the primary app. PostgreSQL logs identify SQLSTATE 57014 in `atlas_people_directory_affiliations` and the relationships branch of `atlas_global_search`. The deployed web code already uses RPCs, so this incident is not caused by the earlier in-memory `listPeople` implementation. Vercel runtime-log access returned 403; database logs supplied the server evidence.

The directory materialized full person records repeatedly and generated affiliation JSON for the entire tenant before pagination. The repair keeps narrow intermediate rows, aggregates affiliation names relationally, and fetches full records and JSON only for the requested page. Counts, ordering, source-derived affiliations, consent logic, and filter semantics are preserved.

Global search now materializes matching relationship IDs before fetching their records. JIT is disabled for this interactive RPC. SELECT policies use the same active-membership predicate against the small tenant set once per statement instead of repeatedly evaluating it for candidate rows. Tenant foreign keys, explicit RPC tenant filters, RLS, write policies and function grants remain intact. The directory's pre-existing explicit membership check and security mode are preserved; no new privileged function is introduced.

Validation on the existing dataset, inside rolled-back transactions before application:

- Full directory and page 2 matched the previous results exactly.
- Ringot, Cintrat and Nawel directory and global results matched exactly.
- Additional affiliation, unknown-affiliation and combined-filter comparisons matched, including empty results.
- Cross-tenant requests, nonmembers and anonymous RPC access were denied.
- Measured candidate SQL execution: directory approximately 2.4 seconds; global Ringot approximately 0.64 seconds (not browser latency guarantees).
- Security advisor findings unchanged before/after.

Deployment is a database migration; no frontend redeploy or alias change is necessary. No contact, history, consent, import, campaign, scheduler or message data is changed. No communication endpoint is invoked by these tests.
