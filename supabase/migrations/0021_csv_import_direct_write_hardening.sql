-- Restore the intended server-only write boundary for CSV import history.
-- The application already writes these tables through controlled RPCs; direct
-- PostgREST writes from public/anon/authenticated must remain unavailable.

revoke insert, update, delete on table public.csv_import_runs
from public, anon, authenticated;

revoke insert, update, delete on table public.csv_import_cancellations
from public, anon, authenticated;
