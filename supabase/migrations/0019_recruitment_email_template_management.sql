create table public.recruitment_email_template_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_key text not null default 'initial_recruitment' check (template_key = 'initial_recruitment'),
  version_number integer not null check (version_number > 0),
  template_name text not null check (length(trim(template_name)) between 3 and 120),
  subject text not null check (length(trim(subject)) between 3 and 200),
  preview_text text not null default '' check (length(preview_text) <= 200),
  headline text not null check (length(trim(headline)) between 3 and 200),
  body_text text not null check (length(trim(body_text)) between 20 and 10000),
  signature_name text not null check (length(trim(signature_name)) between 2 and 120),
  signature_title text not null default '' check (length(signature_title) <= 160),
  sender_name text not null check (length(trim(sender_name)) between 2 and 120),
  sender_email text not null check (length(trim(sender_email)) > 3 and position('@' in sender_email) > 1),
  reply_to text check (reply_to is null or (length(trim(reply_to)) > 3 and position('@' in reply_to) > 1)),
  brand_color text not null default '#0B3D3B' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  html_content text not null check (length(html_content) > 50),
  status text not null default 'draft' check (status in ('draft', 'synced', 'active', 'error')),
  brevo_template_id bigint check (brevo_template_id is null or brevo_template_id > 0),
  last_sync_error text,
  created_by uuid not null references auth.users(id),
  activated_by uuid references auth.users(id),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_email_template_versions_version_unique unique (tenant_id, template_key, version_number)
);

create unique index recruitment_email_template_versions_one_active_idx
  on public.recruitment_email_template_versions (tenant_id, template_key)
  where status = 'active';

create index recruitment_email_template_versions_tenant_created_idx
  on public.recruitment_email_template_versions (tenant_id, template_key, version_number desc);

create trigger set_recruitment_email_template_versions_updated_at
before update on public.recruitment_email_template_versions
for each row execute function public.set_updated_at();

create trigger audit_recruitment_email_template_versions_changes
after insert or update or delete on public.recruitment_email_template_versions
for each row execute function public.audit_changes();

alter table public.recruitment_email_template_versions enable row level security;

create policy recruitment_email_template_versions_select_for_members
on public.recruitment_email_template_versions for select
to authenticated
using (public.is_tenant_member(tenant_id));

grant select on table public.recruitment_email_template_versions to authenticated;
revoke insert, update, delete on table public.recruitment_email_template_versions from authenticated;

create or replace function public.create_recruitment_email_template_version(
  p_tenant_id uuid,
  p_template_name text,
  p_subject text,
  p_preview_text text,
  p_headline text,
  p_body_text text,
  p_signature_name text,
  p_signature_title text,
  p_sender_name text,
  p_sender_email text,
  p_reply_to text,
  p_brand_color text,
  p_html_content text
)
returns public.recruitment_email_template_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.recruitment_email_template_versions;
  v_version_number integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not public.has_tenant_role(p_tenant_id, array['owner', 'admin']) then
    raise exception 'TEMPLATE_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text || ':initial_recruitment'));
  select coalesce(max(version_number), 0) + 1 into v_version_number
  from public.recruitment_email_template_versions
  where tenant_id = p_tenant_id and template_key = 'initial_recruitment';

  insert into public.recruitment_email_template_versions (
    tenant_id, version_number, template_name, subject, preview_text, headline,
    body_text, signature_name, signature_title, sender_name, sender_email,
    reply_to, brand_color, html_content, created_by
  ) values (
    p_tenant_id, v_version_number, trim(p_template_name), trim(p_subject),
    coalesce(trim(p_preview_text), ''), trim(p_headline), trim(p_body_text),
    trim(p_signature_name), coalesce(trim(p_signature_title), ''), trim(p_sender_name),
    lower(trim(p_sender_email)), nullif(lower(trim(p_reply_to)), ''), upper(trim(p_brand_color)),
    p_html_content, v_user_id
  ) returning * into v_version;

  return v_version;
end;
$$;

create or replace function public.activate_recruitment_email_template_version(
  p_version_id uuid,
  p_brevo_template_id bigint
)
returns public.recruitment_email_template_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.recruitment_email_template_versions;
begin
  select * into v_version
  from public.recruitment_email_template_versions
  where id = p_version_id
  for update;

  if v_user_id is null or v_version.id is null
     or not public.has_tenant_role(v_version.tenant_id, array['owner', 'admin']) then
    raise exception 'TEMPLATE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if p_brevo_template_id is null or p_brevo_template_id <= 0 then
    raise exception 'BREVO_TEMPLATE_ID_REQUIRED' using errcode = '22023';
  end if;

  update public.recruitment_email_template_versions
  set status = 'synced'
  where tenant_id = v_version.tenant_id
    and template_key = v_version.template_key
    and status = 'active'
    and id <> v_version.id;

  update public.recruitment_email_template_versions
  set status = 'active', brevo_template_id = p_brevo_template_id,
      last_sync_error = null, activated_by = v_user_id, activated_at = now()
  where id = v_version.id
  returning * into v_version;

  return v_version;
end;
$$;

create or replace function public.mark_recruitment_email_template_sync_error(
  p_version_id uuid,
  p_error text
)
returns public.recruitment_email_template_versions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.recruitment_email_template_versions;
begin
  select * into v_version
  from public.recruitment_email_template_versions
  where id = p_version_id
  for update;

  if v_user_id is null or v_version.id is null
     or not public.has_tenant_role(v_version.tenant_id, array['owner', 'admin']) then
    raise exception 'TEMPLATE_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  update public.recruitment_email_template_versions
  set status = 'error', last_sync_error = left(coalesce(nullif(trim(p_error), ''), 'Erreur Brevo'), 500)
  where id = v_version.id
  returning * into v_version;

  return v_version;
end;
$$;

revoke all on function public.create_recruitment_email_template_version(uuid, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.activate_recruitment_email_template_version(uuid, bigint) from public, anon;
revoke all on function public.mark_recruitment_email_template_sync_error(uuid, text) from public, anon;
grant execute on function public.create_recruitment_email_template_version(uuid, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.activate_recruitment_email_template_version(uuid, bigint) to authenticated;
grant execute on function public.mark_recruitment_email_template_sync_error(uuid, text) to authenticated;
