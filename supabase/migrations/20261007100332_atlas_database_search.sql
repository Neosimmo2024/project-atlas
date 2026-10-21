-- Match the application's NFD/diacritic-insensitive, literal substring search.
create or replace function public.atlas_search_normalize(value text)
returns text language sql immutable parallel safe security invoker
set search_path = pg_catalog
as $$ select lower(btrim(regexp_replace(normalize(coalesce(value, ''), NFD), U&'[\0300-\036f]', '', 'g'))) $$;

create or replace function public.atlas_search_rank(search_values text[], search_query text)
returns integer language sql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
  select min(case
    when public.atlas_search_normalize(value) = search_query then 0
    when starts_with(public.atlas_search_normalize(value), search_query) then 1
    when strpos(public.atlas_search_normalize(value), search_query) > 0 then 2
    else null end)
  from unnest(search_values) value
$$;

create index if not exists people_tenant_updated_id_idx
on public.people (tenant_id, updated_at desc, id);

create or replace function public.atlas_search_people(
  p_tenant_id uuid, p_query text default '', p_status text default '',
  p_priority text default '', p_qualification_state text default '',
  p_talent_score text default '', p_page integer default 1, p_page_size integer default 10
)
returns jsonb language sql stable security invoker set search_path = pg_catalog
as $$
  with matched as materialized (
    select p.*, coalesce(q.state, 'none') as qualification_state
    from public.people p
    left join public.talent_qualifications q on q.tenant_id = p.tenant_id and q.person_id = p.id
    where p.tenant_id = p_tenant_id
      and (coalesce(p_status, '') = '' or p.status = p_status)
      and (coalesce(p_priority, '') = '' or p.priority = p_priority)
      and (coalesce(p_qualification_state, '') = '' or coalesce(q.state, 'none') = p_qualification_state)
      and (coalesce(p_talent_score, '') = ''
        or (p_talent_score = 'unscored' and p.talent_score is null)
        or p.talent_score::text = p_talent_score)
      and (public.atlas_search_normalize(p_query) = '' or
        public.atlas_search_rank(array[p.display_name, p.first_name, p.last_name, p.primary_email, p.primary_phone, p.city], public.atlas_search_normalize(p_query)) is not null)
  ), page_rows as (
    select * from matched order by updated_at desc, id
    limit least(greatest(coalesce(p_page_size, 10), 1), 50)
    offset (greatest(coalesce(p_page, 1), 1)::bigint - 1) * least(greatest(coalesce(p_page_size, 10), 1), 50)
  )
  select jsonb_build_object('people', coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc, r.id) from page_rows r), '[]'::jsonb),
    'total', (select count(*) from matched))
$$;

-- Filter and rank every source before limiting results. No recent-row cutoff.
create or replace function public.atlas_global_search(p_tenant_id uuid, p_query text)
returns table(category text, row_data jsonb)
language plpgsql stable security invoker set search_path = pg_catalog
as $$
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
        v_from := 'public.relationships r left join public.people p on p.id = r.person_id and p.tenant_id = r.tenant_id left join public.organizations o on o.id = r.organization_id and o.tenant_id = r.tenant_id';
        v_values := 'array[coalesce(p.display_name, ''Personne non renseignee'') || '' - '' || coalesce(o.name, ''Organisation non renseignee''), r.relationship_type, r.status, r.pipeline_stage]';
        v_data := 'to_jsonb(r) || jsonb_build_object(''people'', jsonb_build_object(''display_name'', p.display_name), ''organizations'', jsonb_build_object(''name'', o.name))';
      when 'projects' then v_values := 'array[r.title, r.project_type, r.status]';
      when 'interactions' then
        v_values := 'array[r.title, r.summary]'; v_extra := 'and r.deleted_at is null';
      when 'tasks' then
        v_values := 'array[r.title, r.reason]'; v_extra := 'and r.deleted_at is null';
    end case;
    return query execute format(
      'select $3::text, %s from %s where r.tenant_id = $1 %s and public.atlas_search_rank(%s, $2) is not null order by public.atlas_search_rank(%s, $2), r.updated_at desc, r.id limit 25',
      v_data, v_from, v_extra, v_values, v_values
    ) using p_tenant_id, v_query, v_category;
  end loop;
end;
$$;

revoke all on function public.atlas_search_normalize(text) from public, anon;
revoke all on function public.atlas_search_rank(text[], text) from public, anon;
revoke all on function public.atlas_search_people(uuid, text, text, text, text, text, integer, integer) from public, anon;
revoke all on function public.atlas_global_search(uuid, text) from public, anon;
grant execute on function public.atlas_search_normalize(text) to authenticated, service_role;
grant execute on function public.atlas_search_rank(text[], text) to authenticated, service_role;
grant execute on function public.atlas_search_people(uuid, text, text, text, text, text, integer, integer) to authenticated, service_role;
grant execute on function public.atlas_global_search(uuid, text) to authenticated, service_role;
;

