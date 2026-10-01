-- Additive QA change. Existing tenant RLS and review timestamp trigger apply.
alter table public.prospect_reviews
  add column linkedin_url text not null default '' check (length(linkedin_url) <= 2000 and (linkedin_url = '' or linkedin_url ~ '^https://([a-z]{2,3}\.)?linkedin\.com/in/[^/?#]+/?([?#].*)?$')),
  add column linkedin_status text not null default 'not_checked' check (linkedin_status in ('not_checked','not_found','unavailable','consistent','conflict')),
  add column linkedin_role text not null default '' check (length(linkedin_role) <= 200),
  add column linkedin_network text not null default '' check (length(linkedin_network) <= 200),
  add column linkedin_area text not null default '' check (length(linkedin_area) <= 200),
  add column linkedin_evidence text not null default '' check (length(linkedin_evidence) <= 1000),
  add column linkedin_checked_on date,
  add constraint prospect_linkedin_dated check (linkedin_status = 'not_checked' or linkedin_checked_on is not null),
  add constraint prospect_linkedin_evidence check (linkedin_status not in ('consistent','conflict') or (linkedin_url <> '' and btrim(linkedin_evidence) <> '')),
  add constraint prospect_linkedin_consistent check (linkedin_status <> 'consistent' or (btrim(linkedin_role) <> '' and btrim(linkedin_area) <> '')),
  add constraint prospect_linkedin_conflict check (status <> 'qualified' or linkedin_status <> 'conflict');
grant update(linkedin_url, linkedin_status, linkedin_role, linkedin_network, linkedin_area, linkedin_evidence, linkedin_checked_on) on public.prospect_reviews to authenticated;
