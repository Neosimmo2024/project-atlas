create or replace function public.atlas_people_directory_affiliations(
p_tenant_id uuid, p_query text default '', p_status text default '', p_priority text default '',
p_qualification_state text default '', p_talent_score text default '', p_page integer default 1, p_page_size integer default 10, p_affiliation text default '')
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
), linked as (
select distinct r.person_id, o.name, o.organization_type
from public.relationships r join public.organizations o on o.id=r.organization_id and o.tenant_id=r.tenant_id
join matched m on m.id=r.person_id and m.tenant_id=r.tenant_id
where r.tenant_id=$1 and r.status<>'archived'
and o.organization_type in ('network','agency','independent_agency','franchise')
), affiliations as (
select person_id,jsonb_agg(jsonb_build_object('name',name,'type',organization_type,'from_source',false) order by name) as items
from linked group by person_id
), sourced as (
select m.id, case
when m.source ilike '%optimhome%' then 'Optimhome'
when m.source ilike '%safti.fr/%' then 'SAFTI'
when m.source ilike '%sextantfrance.fr/%' then 'Sextant'
when m.source ilike '%immo-reseau.com/%' then 'Immo Réseau'
when m.source ilike '%INSTANTiMMO%' then 'INSTANTiMMO'
else null end as name
from matched m
), consent as (
select distinct on (i.person_id) i.person_id, i.metadata->>'whatsapp_event' as event
from public.interactions i join matched m on m.id=i.person_id and m.tenant_id=i.tenant_id
where i.tenant_id=$1 and i.deleted_at is null and i.metadata->>'channel'='whatsapp_manual'
and i.metadata->>'whatsapp_event' in ('consent_granted','consent_revoked')
order by i.person_id,i.created_at desc,i.id desc
), directory as materialized (
select m.*, coalesce(a.items,case when s.name is not null then jsonb_build_array(jsonb_build_object('name',s.name,'type','network','from_source',true)) else '[]'::jsonb end) as affiliations,
(not coalesce(m.do_not_contact,false) and c.event='consent_granted'
and public.atlas_whatsapp_phone_valid(m.primary_phone)) is true as whatsapp_ready,
exists(select 1 from public.interactions i where i.tenant_id=m.tenant_id and i.person_id=m.id and i.deleted_at is null
and i.metadata->>'channel'='whatsapp_manual' and i.metadata->>'whatsapp_event'='sent'
and (i.metadata->>'template_id'='lpgi-ormesson-20261015' or
(i.summary like '%Petits Génies de l’Immobilier%' and i.summary like '%15 octobre%' and i.summary like '%https://event.lpgi.club/afterwork%'))) as whatsapp_invited
from matched m left join consent c on c.person_id=m.id
left join affiliations a on a.person_id=m.id left join sourced s on s.id=m.id
), filtered as materialized (
select * from directory d where coalesce($9,'')=''
or ($9='__unknown' and jsonb_array_length(d.affiliations)=0)
or exists(select 1 from jsonb_array_elements(d.affiliations) item where item->>'name'=$9)
), organization_options as (
select item->>'name' as name,count(distinct d.id) as count from directory d
cross join lateral jsonb_array_elements(d.affiliations) item group by item->>'name'
), page_rows as (
select * from filtered
order by (whatsapp_ready and not whatsapp_invited) desc, whatsapp_ready desc, updated_at desc,id
limit least(greatest(coalesce($8,10),1),50)
offset (greatest(coalesce($7,1),1)-1)::bigint * least(greatest(coalesce($8,10),1),50)
)
select jsonb_build_object('people',coalesce((select jsonb_agg(to_jsonb(r) order by (whatsapp_ready and not whatsapp_invited) desc,whatsapp_ready desc,updated_at desc,id) from page_rows r),'[]'::jsonb),
 'total',(select count(*) from filtered),'whatsappReady',(select count(*) from filtered where whatsapp_ready),
 'whatsappRemaining',(select count(*) from filtered where whatsapp_ready and not whatsapp_invited),
'organizations',coalesce((select jsonb_agg(to_jsonb(o) order by name) from organization_options o),'[]'::jsonb),
'unknownAffiliations',(select count(*) from directory where jsonb_array_length(affiliations)=0))
$query$ into result using p_tenant_id,p_query,p_status,p_priority,p_qualification_state,p_talent_score,p_page,p_page_size,p_affiliation;
return result;
end;
$$;
revoke all on function public.atlas_people_directory_affiliations(uuid,text,text,text,text,text,integer,integer,text) from public,anon;
grant execute on function public.atlas_people_directory_affiliations(uuid,text,text,text,text,text,integer,integer,text) to authenticated,service_role;
