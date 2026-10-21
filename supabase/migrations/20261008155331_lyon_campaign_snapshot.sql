-- Pin the dedicated campaign when the first email is explicitly launched.
-- Existing national sequences retain a NULL snapshot; no sequences are created here.
alter table public.recruitment_email_sequences
  add column campaign_snapshot jsonb;
comment on column public.recruitment_email_sequences.campaign_snapshot is
  'Dedicated campaign project, version IDs, Brevo template IDs and approved day offsets. No automatic launch.';
