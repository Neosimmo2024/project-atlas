alter table public.prospect_lists add column target_key text not null default 'postal'
  check (target_key in ('postal','saint_maur'));
