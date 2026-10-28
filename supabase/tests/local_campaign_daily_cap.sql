-- Incident regression on 2026-10-19: 80 overdue initial steps, no HTTP/email side effects.
-- Run in an authorized populated environment; every claim is rolled back.
begin;
do $test$
declare first_claim integer; second_claim integer;
begin
  select count(*) into first_claim from public.claim_due_recruitment_email_steps(100);
  if first_claim <> 40 then raise exception 'Daily cap regression: first claim %, expected 40',first_claim; end if;
  select count(*) into second_claim from public.claim_due_recruitment_email_steps(100);
  if second_claim <> 0 then raise exception 'Daily cap regression: second claim %, expected 0',second_claim; end if;
  if (select count(*) from public.recruitment_email_sequence_steps st join public.recruitment_email_sequences s on s.id=st.sequence_id where s.campaign_snapshot->>'key'='saint-maur-local-20261016' and st.status='processing') <> 40 then raise exception 'Reservation mismatch'; end if;
end $test$;
rollback;

