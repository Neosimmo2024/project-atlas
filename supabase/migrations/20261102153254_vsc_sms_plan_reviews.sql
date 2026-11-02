-- Immutable review documents only. No relation to the dispatch queue or campaigns.
create table public.vsc_sms_plan_reviews(
 tenant_id uuid not null references public.tenants(id),id uuid not null,
 start_date date not null,contacts jsonb not null,calendar jsonb not null,
 recipient_count integer not null check(recipient_count between 1 and 999),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 primary key(tenant_id,id),
 check(jsonb_typeof(contacts)='array' and jsonb_array_length(contacts)=recipient_count and pg_column_size(contacts)<=500000),
 check(jsonb_typeof(calendar)='object' and pg_column_size(calendar)<=100000 and calendar->'readOnly'='true'::jsonb and calendar->'sendingEnabled'='false'::jsonb)
);
create index vsc_sms_plan_reviews_creator_idx on public.vsc_sms_plan_reviews(created_by);
alter table public.vsc_sms_plan_reviews enable row level security;
revoke all on public.vsc_sms_plan_reviews from public,anon,authenticated,service_role;
grant select on public.vsc_sms_plan_reviews to authenticated;
grant select,insert on public.vsc_sms_plan_reviews to service_role;
create policy vsc_sms_plan_admin_read on public.vsc_sms_plan_reviews for select to authenticated using(exists(
 select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id
 where tu.tenant_id=vsc_sms_plan_reviews.tenant_id and tu.user_id=(select auth.uid()) and tu.status='active' and r.slug in ('owner','admin')));
create function public.vsc_save_sms_plan_review(p_tenant_id uuid,p_actor_id uuid,p_id uuid,p_start_date date,p_contacts jsonb,p_calendar jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actual jsonb; stored public.vsc_sms_plan_reviews%rowtype; inserted integer;
begin
 if p_tenant_id is null or p_id is null or p_start_date is null or p_start_date<(now() at time zone 'Europe/Paris')::date or p_start_date>'2026-11-30'::date then raise exception 'Invalid review date';end if;
 if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then raise exception 'VSC administrator required';end if;
 if jsonb_typeof(p_contacts) is distinct from 'array' or jsonb_typeof(p_calendar) is distinct from 'object' then raise exception 'Invalid review';end if;
 if jsonb_array_length(p_contacts) not between 1 and 999 or pg_column_size(p_contacts)>500000 or pg_column_size(p_calendar)>100000 then raise exception 'Invalid review size';end if;
 if p_calendar->'readOnly' is distinct from 'true'::jsonb or p_calendar->'sendingEnabled' is distinct from 'false'::jsonb
 or p_calendar->>'startDate' is distinct from p_start_date::text or p_calendar->>'today' is distinct from (now() at time zone 'Europe/Paris')::date::text
 or p_calendar->'mobileOnly' is distinct from to_jsonb(jsonb_array_length(p_contacts))
 or jsonb_typeof(p_calendar->'mobileOnlySteps') is distinct from 'array' then raise exception 'Invalid review calendar';end if;
 if jsonb_array_length(p_calendar->'mobileOnlySteps')<>5 then raise exception 'Incomplete review';end if;
 if exists(select 1 from jsonb_array_elements(p_calendar->'mobileOnlySteps') with ordinality s(value,n) where
 s.value->'offsetDays' is distinct from to_jsonb(((s.n-1)*15)::integer)
 or s.value->>'date' is distinct from (p_start_date+((s.n-1)*15)::integer)::text
 or s.value->'count' is distinct from to_jsonb(jsonb_array_length(p_contacts))
 or jsonb_typeof(s.value->'text') is distinct from 'string' or length(s.value->>'text') not between 1 and 2000
 or s.value->>'text' not like '%VendreSonCommerce%' or s.value->>'text' not like '%STOP au [STOP_CODE]%'
 or s.value->'promotional' is distinct from to_jsonb(p_start_date+((s.n-1)*15)::integer<='2026-11-30'::date)
 or (p_start_date+((s.n-1)*15)::integer>'2026-11-30'::date and s.value->>'text' ~ '(79|159)')
 or jsonb_typeof(s.value->'providerDayAllowed') is distinct from 'boolean') then raise exception 'Invalid review steps';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
 select jsonb_agg(jsonb_build_object('id',c.id,'mobile',c.mobile) order by c.mobile,c.id) into actual
 from public.vsc_sms_audience_contacts(p_tenant_id) c where not c.has_email;
 if actual is distinct from p_contacts then raise exception 'Mobile-only audience changed';end if;
 insert into public.vsc_sms_plan_reviews(tenant_id,id,start_date,contacts,calendar,recipient_count,created_by)
 values(p_tenant_id,p_id,p_start_date,actual,p_calendar,jsonb_array_length(actual),p_actor_id) on conflict(tenant_id,id) do nothing;
 get diagnostics inserted=row_count;
 select * into stored from public.vsc_sms_plan_reviews where tenant_id=p_tenant_id and id=p_id;
 if stored.start_date is distinct from p_start_date or stored.contacts is distinct from actual or stored.calendar is distinct from p_calendar then raise exception 'Review identity conflict';end if;
 return jsonb_build_object('id',stored.id,'recipients',stored.recipient_count,'reused',inserted=0);
end;
$$;
revoke all on function public.vsc_save_sms_plan_review(uuid,uuid,uuid,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.vsc_save_sms_plan_review(uuid,uuid,uuid,date,jsonb,jsonb) to service_role;
