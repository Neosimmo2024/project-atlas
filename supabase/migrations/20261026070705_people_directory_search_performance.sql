-- Preserve existing tenant authorization and function privileges. No data mutations.
CREATE OR REPLACE FUNCTION public.atlas_people_directory_affiliations(p_tenant_id uuid, p_query text DEFAULT ''::text, p_status text DEFAULT ''::text, p_priority text DEFAULT ''::text, p_qualification_state text DEFAULT ''::text, p_talent_score text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 10, p_affiliation text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET jit TO 'off'
AS $function$
declare result jsonb;
begin
-- Same membership rule as SELECT policies, checked once for this tenant.
if public.is_tenant_member(p_tenant_id) is not true then
  raise exception 'Tenant access denied' using errcode='42501';
end if;
execute $query$
with matched as materialized (
select p.id, p.tenant_id, p.updated_at, p.source, p.do_not_contact, p.primary_phone,
 coalesce(q.state,'none') as qualification_state
from public.people p
left join public.talent_qualifications q on q.tenant_id=p.tenant_id and q.person_id=p.id
where p.tenant_id=$1
and (coalesce($3,'')='' or p.status=$3)
and (coalesce($4,'')='' or p.priority=$4)
and (coalesce($5,'')='' or coalesce(q.state,'none')=$5)
and (coalesce($6,'')='' or ($6='unscored' and p.talent_score is null) or p.talent_score::text=$6)
and (public.atlas_search_normalize($2)=''
or (btrim(public.atlas_city_search($2)) in ('saint maur','saint maur des fosses','la varenne','la varenne saint hilaire')
    and (p.postal_code in ('94100','94210') or p.city_search in ('saint maur des fosses','saint maur des fosses ile de france france')))
or (btrim(public.atlas_city_search($2)) not in ('saint maur','saint maur des fosses','la varenne','la varenne saint hilaire')
    and (p.search_document like public.atlas_search_pattern($2)
    or p.city_search like public.atlas_search_pattern(public.atlas_city_search($2))
    or p.postal_code=public.atlas_search_normalize($2))))
), linked as materialized (
select distinct r.person_id, o.name, o.organization_type
from public.relationships r join public.organizations o on o.id=r.organization_id and o.tenant_id=r.tenant_id
join matched m on m.id=r.person_id and m.tenant_id=r.tenant_id
where r.tenant_id=$1 and r.status<>'archived'
and o.organization_type in ('network','agency','independent_agency','franchise')
), affiliation_names as materialized (
select person_id, name, organization_type, false as from_source from linked
union all
select m.id, src.name, 'network', true
from matched m
cross join lateral (select case
when m.source ilike '%optimhome%' then 'Optimhome'
when m.source ilike '%safti.fr/%' then 'SAFTI'
when m.source ilike '%sextantfrance.fr/%' then 'Sextant'
when m.source ilike '%immo-reseau.com/%' then 'Immo Réseau'
when m.source ilike '%INSTANTiMMO%' then 'INSTANTiMMO'
else null end as name) src
where src.name is not null and not exists(select 1 from linked l where l.person_id=m.id)
), affiliation_flags as (
select person_id, true as known, bool_or(name=$9) as selected
from affiliation_names group by person_id
), consent as (
select distinct on (i.person_id) i.person_id, i.metadata->>'whatsapp_event' as event
from public.interactions i join matched m on m.id=i.person_id and m.tenant_id=i.tenant_id
where i.tenant_id=$1 and i.deleted_at is null and i.metadata->>'channel'='whatsapp_manual'
and i.metadata->>'whatsapp_event' in ('consent_granted','consent_revoked')
order by i.person_id,i.created_at desc,i.id desc
), directory as materialized (
select m.id,m.tenant_id,m.updated_at,m.qualification_state,
coalesce(a.known,false) as affiliation_known, coalesce(a.selected,false) as affiliation_selected,
(not coalesce(m.do_not_contact,false) and coalesce(c.event='consent_granted',false)
and public.atlas_whatsapp_phone_valid(m.primary_phone)) is true as whatsapp_ready,
exists(select 1 from public.interactions i where i.tenant_id=m.tenant_id and i.person_id=m.id and i.deleted_at is null
and i.metadata->>'channel'='whatsapp_manual' and i.metadata->>'whatsapp_event'='sent'
and (i.metadata->>'template_id'='lpgi-ormesson-20261015' or
(i.summary like '%Petits Génies de l’Immobilier%' and i.summary like '%15 octobre%' and i.summary like '%https://event.lpgi.club/afterwork%'))) as whatsapp_invited
from matched m left join consent c on c.person_id=m.id
left join affiliation_flags a on a.person_id=m.id
), filtered as materialized (
select * from directory d where coalesce($9,'')=''
or ($9='__unknown' and not d.affiliation_known)
or d.affiliation_selected
), organization_options as (
select name,count(distinct person_id) as count from affiliation_names group by name
), page_rows as (
select * from filtered
order by (whatsapp_ready and not whatsapp_invited) desc, whatsapp_ready desc, updated_at desc,id
limit least(greatest(coalesce($8,10),1),50)
offset (greatest(coalesce($7,1),1)-1)::bigint * least(greatest(coalesce($8,10),1),50)
)
select jsonb_build_object('people',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('qualification_state',r.qualification_state,'affiliations',coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'type',a.organization_type,'from_source',a.from_source) order by a.name) from affiliation_names a where a.person_id=r.id),'[]'::jsonb),'whatsapp_ready',r.whatsapp_ready,'whatsapp_invited',r.whatsapp_invited) order by (r.whatsapp_ready and not r.whatsapp_invited) desc,r.whatsapp_ready desc,r.updated_at desc,r.id) from page_rows r join public.people p on p.id=r.id and p.tenant_id=$1),'[]'::jsonb),
 'total',(select count(*) from filtered),'whatsappReady',(select count(*) from filtered where whatsapp_ready),
 'whatsappRemaining',(select count(*) from filtered where whatsapp_ready and not whatsapp_invited),
'organizations',coalesce((select jsonb_agg(to_jsonb(o) order by name) from organization_options o),'[]'::jsonb),
'unknownAffiliations',(select count(*) from directory where not affiliation_known))
$query$ into result using p_tenant_id,p_query,p_status,p_priority,p_qualification_state,p_talent_score,p_page,p_page_size,p_affiliation;
return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.atlas_global_search(p_tenant_id uuid, p_query text)
 RETURNS TABLE(category text, row_data jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
 SET jit TO 'off'
AS $function$
declare
  v_query text := public.atlas_search_normalize(p_query);
  v_category text;
  v_from text;
  v_values text;
  v_data text;
  v_extra text;
begin
  if length(v_query) < 2 then return; end if;
  foreach v_category in array array['people', 'organizations', 'relationships', 'projects', 'interactions', 'tasks'] loop
    v_from := format('public.%I r', v_category);
    v_data := 'to_jsonb(r)';
    v_extra := '';
    case v_category
      when 'people' then v_values := 'array[r.display_name, r.first_name, r.last_name, r.primary_email, r.primary_phone, r.city]';
      when 'organizations' then v_values := 'array[r.name, r.legal_name, r.siren, r.siret, r.city]';
      when 'relationships' then
        v_from := '(with candidates as materialized (
          select r2.id from public.relationships r2 where r2.tenant_id = $1 and r2.search_document like public.atlas_search_pattern($2)
          union
          select r2.id from public.relationships r2 join public.people p2 on p2.id = r2.person_id and p2.tenant_id = r2.tenant_id where r2.tenant_id = $1 and p2.search_document like public.atlas_search_pattern($2)
          union
          select r2.id from public.relationships r2 join public.organizations o2 on o2.id = r2.organization_id and o2.tenant_id = r2.tenant_id where r2.tenant_id = $1 and o2.search_document like public.atlas_search_pattern($2)
        ) select base.* from candidates c join public.relationships base on base.id=c.id and base.tenant_id=$1) r left join public.people p on p.id = r.person_id and p.tenant_id = r.tenant_id left join public.organizations o on o.id = r.organization_id and o.tenant_id = r.tenant_id';
        v_values := 'array[coalesce(p.display_name, ''Personne non renseignee'') || '' - '' || coalesce(o.name, ''Organisation non renseignee''), r.relationship_type, r.status, r.pipeline_stage]';
        v_data := 'to_jsonb(r) || jsonb_build_object(''people'', jsonb_build_object(''display_name'', p.display_name), ''organizations'', jsonb_build_object(''name'', o.name))';
      when 'projects' then v_values := 'array[r.title, r.project_type, r.status]';
      when 'interactions' then
        v_values := 'array[r.title, r.summary]'; v_extra := 'and r.deleted_at is null';
      when 'tasks' then
        v_values := 'array[r.title, r.reason]'; v_extra := 'and r.deleted_at is null';
    end case;
    v_extra := v_extra || case when v_category in ('people', 'organizations') then ' and r.search_document like public.atlas_search_pattern($2)' else '' end;
    return query execute format(
      'select $3::text, %s from %s where r.tenant_id = $1 %s and public.atlas_search_rank(%s, $2) is not null order by public.atlas_search_rank(%s, $2), r.updated_at desc, r.id limit 25',
      v_data, v_from, v_extra, v_values, v_values
    ) using p_tenant_id, v_query, v_category;
  end loop;
end;
$function$
;

-- Evaluate active membership per tenant instead of for every candidate row.
alter policy people_select_for_members on public.people
 using (tenant_id in (select t.id from public.tenants t where public.is_tenant_member(t.id)));
alter policy organizations_select_for_members on public.organizations
 using (tenant_id in (select t.id from public.tenants t where public.is_tenant_member(t.id)));
alter policy relationships_select_for_members on public.relationships
 using (tenant_id in (select t.id from public.tenants t where public.is_tenant_member(t.id)));
alter policy projects_select_for_members on public.projects
 using (tenant_id in (select t.id from public.tenants t where public.is_tenant_member(t.id)));
alter policy interactions_select_for_members on public.interactions
 using (tenant_id in (select t.id from public.tenants t where public.is_tenant_member(t.id)));
alter policy tasks_select_for_members on public.tasks
 using (tenant_id in (select t.id from public.tenants t where public.is_tenant_member(t.id)));
