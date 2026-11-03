-- Read-only French mobile preparation. No delivery, contact or campaign mutation.
create function public.vsc_normalize_fr_mobile(p_phone text) returns text
language sql immutable security invoker set search_path = '' as $$
  select case
    when cleaned ~ '^0[67][0-9]{8}$' then '+33' || substr(cleaned,2)
    when cleaned ~ '^\+33[67][0-9]{8}$' then cleaned
    when cleaned ~ '^0033[67][0-9]{8}$' then '+' || substr(cleaned,3)
    else null end
  from (select case when p_phone ~ '^[+0-9 .()\-]+$'
    then regexp_replace(p_phone,'[ .()\-]','','g') else null end as cleaned) p;
$$;
revoke all on function public.vsc_normalize_fr_mobile(text) from public,anon,authenticated;
grant execute on function public.vsc_normalize_fr_mobile(text) to service_role;

create function public.vsc_sms_draft_contacts(p_tenant_id uuid)
returns table(id uuid,display_name text,mobile text,has_email boolean)
language sql stable security invoker set search_path = '' as $$
  with phones as materialized (
    select p.*,public.vsc_normalize_fr_mobile(p.primary_phone) as normalized
    from public.people p where p.tenant_id=p_tenant_id
  ), eligible as (
    select p.id,p.display_name,p.normalized as mobile,
      (coalesce(p.primary_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$',false)
        and not exists(select 1 from public.vsc_contact_suppressions s
          where s.tenant_id=p_tenant_id and s.person_id=p.id and s.channel in ('all','email'))) as has_email
    from phones p
    where p.normalized is not null and p.contact_allowed is true and p.do_not_contact is false
      and not exists(select 1 from phones alias where alias.normalized=p.normalized and (
        alias.do_not_contact is true
        or exists(select 1 from public.vsc_contact_suppressions s
          where s.tenant_id=p_tenant_id and s.person_id=alias.id and s.channel in ('all','sms'))
        or exists(select 1 from public.vsc_inbound_replies r
          where r.tenant_id=p_tenant_id and r.person_id=alias.id)))
  )
  select distinct on(e.mobile) e.id,e.display_name,e.mobile,e.has_email
  from eligible e order by e.mobile,e.has_email desc,e.id limit 101;
$$;
revoke all on function public.vsc_sms_draft_contacts(uuid) from public,anon,authenticated;
grant execute on function public.vsc_sms_draft_contacts(uuid) to service_role;
