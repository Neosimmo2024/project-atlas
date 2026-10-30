-- Immutable copy snapshot for draft review; existing drafts are left without content.
alter table public.vsc_campaigns add column email_content jsonb;
alter table public.vsc_campaigns add constraint vsc_email_content_shape check (
  email_content is null or (jsonb_typeof(email_content) is not distinct from 'object'
    and email_content->'version' is not distinct from '1'::jsonb and jsonb_typeof(email_content->'messages') is not distinct from 'array'
    and jsonb_array_length(email_content->'messages')=3 and pg_column_size(email_content)<=100000)
);
create or replace function public.vsc_create_email_draft_with_content(
  p_tenant_id uuid,p_campaign_id uuid,p_name text,p_start_date date,p_person_ids uuid[],p_content jsonb
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare result jsonb; stored jsonb;
begin
  if jsonb_typeof(p_content) is distinct from 'object' or p_content->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_content->'messages') is distinct from 'array'
  then raise exception 'Invalid VSC email content'; end if;
  if jsonb_array_length(p_content->'messages')<>3 or pg_column_size(p_content)>100000
  then raise exception 'Invalid VSC email content'; end if;
  if (select count(distinct m->>'stepKey') from jsonb_array_elements(p_content->'messages') m where m->>'stepKey' in ('offer','consideration','last-chance'))<>3
    or exists(select 1 from jsonb_array_elements(p_content->'messages') m
      where jsonb_typeof(m->'subject') is distinct from 'string' or jsonb_typeof(m->'text') is distinct from 'string'
      or length(trim(m->>'subject')) not between 1 and 200 or length(trim(m->>'text')) not between 1 and 6000
      or m->>'subject' ~ E'[\\r\\n]')
  then raise exception 'Invalid VSC email messages'; end if;
  result := public.vsc_create_email_draft(p_tenant_id,p_campaign_id,p_name,p_start_date,p_person_ids);
  select email_content into stored from public.vsc_campaigns where tenant_id=p_tenant_id and id=p_campaign_id for update;
  if stored is null then
    update public.vsc_campaigns set email_content=p_content where tenant_id=p_tenant_id and id=p_campaign_id and state='draft' and approved_at is null and enabled_at is null;
    if not found then raise exception 'VSC draft not modifiable'; end if;
  elsif stored is distinct from p_content then
    raise exception 'VSC draft content identity conflict';
  end if;
  return result;
end;
$$;
revoke all on function public.vsc_create_email_draft_with_content(uuid,uuid,text,date,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.vsc_create_email_draft_with_content(uuid,uuid,text,date,uuid[],jsonb) to service_role;
