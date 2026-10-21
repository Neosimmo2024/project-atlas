-- City aliases and WhatsApp priority are evaluated before pagination, under caller RLS.
create or replace function public.atlas_city_search(value text)
returns text language sql immutable parallel safe security invoker set search_path=pg_catalog
as $$ select regexp_replace(regexp_replace(public.atlas_search_normalize(value), '[^a-z0-9]+', ' ', 'g'), '^st +', 'saint ') $$;

create or replace function public.atlas_whatsapp_phone_valid(value text)
returns boolean language sql immutable parallel safe security invoker set search_path=pg_catalog
as $$ select coalesce(value ~ '^[+0-9[:space:]().-]+$' and
regexp_replace(value, '[[:space:]().-]', '', 'g') ~ '^(0[1-9][0-9]{8}|\+[1-9][0-9]{7,14}|00[1-9][0-9]{7,14})$', false) $$;

alter table public.people add column if not exists city_search text generated always as (public.atlas_city_search(city)) stored;
create index if not exists people_city_search_idx on public.people using gin (city_search extensions.gin_trgm_ops);
create index if not exists people_tenant_postal_idx on public.people (tenant_id,postal_code);

create or replace function public.atlas_people_directory(
p_tenant_id uuid, p_query text default '', p_status text default '', p_priority text default '',
p_qualification_state text default '', p_talent_score text default '', p_page integer default 1, p_page_size integer default 10)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog
as $$
declare result jsonb;
begin
execute $query$
with matched as materialized (
select p.*, coalesce(q.state,'none') as qualification_state
from public.people p
left join public.talent_qualifications q on q.tenant_id=p.tenant_id and q.person_id=p.id
where p.tenant_id=$1
and (coalesce($3,'')='' or p.status=$3)
and (coalesce($4,'')='' or p.priority=$4)
and (coalesce($5,'')='' or coalesce(q.state,'none')=$5)
and (coalesce($6,'')='' or ($6='unscored' and p.talent_score is null) or p.talent_score::text=$6)
and (public.atlas_search_normalize($2)=''
or p.search_document like public.atlas_search_pattern($2)
or p.city_search like public.atlas_search_pattern(public.atlas_city_search($2))
or (btrim(public.atlas_city_search($2)) in ('saint maur','saint maur des fosses','la varenne','la varenne saint hilaire')
and (p.postal_code in ('94100','94210') or p.city_search like 'saint maur des foss%'))
or p.postal_code=public.atlas_search_normalize($2))
), consent as (
select distinct on (i.person_id) i.person_id, i.metadata->>'whatsapp_event' as event
from public.interactions i join matched m on m.id=i.person_id and m.tenant_id=i.tenant_id
where i.tenant_id=$1 and i.deleted_at is null and i.metadata->>'channel'='whatsapp_manual'
and i.metadata->>'whatsapp_event' in ('consent_granted','consent_revoked')
order by i.person_id,i.created_at desc,i.id desc
), directory as materialized (
select m.*, (not coalesce(m.do_not_contact,false) and c.event='consent_granted'
and public.atlas_whatsapp_phone_valid(m.primary_phone)) is true as whatsapp_ready,
exists(select 1 from public.interactions i where i.tenant_id=m.tenant_id and i.person_id=m.id and i.deleted_at is null
and i.metadata->>'channel'='whatsapp_manual' and i.metadata->>'whatsapp_event'='sent'
and (i.metadata->>'template_id'='lpgi-ormesson-20261015' or
(i.summary like '%Petits Génies de l’Immobilier%' and i.summary like '%15 octobre%' and i.summary like '%https://event.lpgi.club/afterwork%'))) as whatsapp_invited
from matched m left join consent c on c.person_id=m.id
), page_rows as (
select * from directory
order by (whatsapp_ready and not whatsapp_invited) desc, whatsapp_ready desc, updated_at desc,id
limit least(greatest(coalesce($8,10),1),50)
offset (greatest(coalesce($7,1),1)-1)::bigint * least(greatest(coalesce($8,10),1),50)
)
select jsonb_build_object('people',coalesce((select jsonb_agg(to_jsonb(r) order by (whatsapp_ready and not whatsapp_invited) desc,whatsapp_ready desc,updated_at desc,id) from page_rows r),'[]'::jsonb),
 'total',(select count(*) from directory),'whatsappReady',(select count(*) from directory where whatsapp_ready),
 'whatsappRemaining',(select count(*) from directory where whatsapp_ready and not whatsapp_invited))
$query$ into result using p_tenant_id,p_query,p_status,p_priority,p_qualification_state,p_talent_score,p_page,p_page_size;
return result;
end;
$$;
revoke all on function public.atlas_city_search(text), public.atlas_whatsapp_phone_valid(text), public.atlas_people_directory(uuid,text,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.atlas_city_search(text), public.atlas_whatsapp_phone_valid(text), public.atlas_people_directory(uuid,text,text,text,text,text,integer,integer) to authenticated,service_role;


