alter table public.prospect_reviews
  add column first_name text not null default '' check (length(first_name) <= 80),
  add column last_name text not null default '' check (length(last_name) <= 80);
grant update(first_name, last_name) on public.prospect_reviews to authenticated;
