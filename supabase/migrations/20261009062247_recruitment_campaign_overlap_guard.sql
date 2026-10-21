-- Database-side guard: effective on the existing initial-send and worker paths.
-- All project profiles are reserved, not only the reviewed recipient subset.
create index recruitment_sequences_normalized_email_idx
  on public.recruitment_email_sequences (tenant_id, lower(btrim(email)));
create index people_normalized_email_campaign_idx
  on public.people (tenant_id, lower(btrim(primary_email))) where primary_email is not null;

create function public.recruitment_campaign_block_reason(
  p_tenant_id uuid, p_person_id uuid, p_email text,
  p_project_id text default null, p_sequence_id uuid default null
)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_project public.projects;
  v_campaign jsonb;
  v_email text := lower(btrim(p_email));
begin
  if nullif(v_email, '') is null then return 'EMAIL_REQUIRED'; end if;
  if not exists (select 1 from public.people p where p.id = p_person_id and p.tenant_id = p_tenant_id) then
    return 'PERSON_NOT_FOUND';
  end if;
  for v_project in
    select pr.* from public.projects pr
    where pr.tenant_id = p_tenant_id and pr.status = 'open' and pr.archived_at is null
      and (pr.metadata ? 'lyon_development' or pr.metadata->'recruitment_email_campaign'->>'scope' = 'targeted')
      and (
        coalesce(pr.metadata->'lyon_development'->'person_ids', '[]'::jsonb) ? p_person_id::text
        or coalesce(pr.metadata->'recruitment_email_campaign'->'person_ids', '[]'::jsonb) ? p_person_id::text
        or coalesce(pr.metadata->'recruitment_email_campaign'->'recipient_ids', '[]'::jsonb) ? p_person_id::text
        or exists (
          select 1 from public.people alias where alias.tenant_id = p_tenant_id
          and lower(btrim(alias.primary_email)) = v_email
          and (coalesce(pr.metadata->'lyon_development'->'person_ids', '[]'::jsonb) ? alias.id::text
            or coalesce(pr.metadata->'recruitment_email_campaign'->'person_ids', '[]'::jsonb) ? alias.id::text
            or coalesce(pr.metadata->'recruitment_email_campaign'->'recipient_ids', '[]'::jsonb) ? alias.id::text)
        )
      )
  loop
    if p_project_id is distinct from v_project.id::text then return 'TARGETED_CAMPAIGN_RESERVED'; end if;
  end loop;

  if p_project_id is not null then
    select * into v_project from public.projects pr
      where pr.tenant_id = p_tenant_id and pr.id::text = p_project_id
        and pr.status = 'open' and pr.archived_at is null;
    v_campaign := v_project.metadata->'recruitment_email_campaign';
    if v_project.id is null or v_campaign->>'state' is distinct from 'ready'
      or v_campaign->>'launch_enabled' is distinct from 'true'
      or v_campaign->>'sender_verified' is distinct from 'true'
      or jsonb_array_length(coalesce(v_campaign->'template_ids', '[]'::jsonb)) <> 3
      or not coalesce(v_campaign->'recipient_ids', '[]'::jsonb) ? p_person_id::text then
      return 'TARGETED_CAMPAIGN_NOT_AUTHORIZED';
    end if;
  end if;

  -- Historical sends remain evidence even after a stop, completion or email edit.
  if exists (select 1 from public.recruitment_email_sequences s
    where s.tenant_id = p_tenant_id and s.id is distinct from p_sequence_id
      and (s.person_id = p_person_id or lower(btrim(s.email)) = v_email)
      and (s.status in ('pending', 'sent') or s.sent_at is not null)) then
    return 'OTHER_EMAIL_SEQUENCE';
  end if;
  if exists (select 1 from public.timeline_events e
    left join public.people alias on alias.id = e.person_id and alias.tenant_id = e.tenant_id
    where e.tenant_id = p_tenant_id
      and e.event_type in ('recruitment_email_sent', 'recruitment_email_queued')
      and (e.person_id = p_person_id or lower(btrim(alias.primary_email)) = v_email
        or lower(btrim(e.metadata->>'email')) = v_email or lower(btrim(e.description)) = v_email)
      and (p_sequence_id is null or e.metadata->>'sequence_id' is distinct from p_sequence_id::text)
      and (p_project_id is null or e.metadata->>'project_id' is distinct from p_project_id)
      -- Ignore native queue entries whose sequence was explicitly stopped or failed.
      and not (e.event_type = 'recruitment_email_queued' and exists (
        select 1 from public.recruitment_email_sequences s where s.tenant_id = p_tenant_id
          and s.id::text = e.metadata->>'sequence_id' and s.status in ('stopped', 'error') and s.sent_at is null
      ))) then
    return 'OTHER_EMAIL_HISTORY';
  end if;
  return null;
end;
$$;
revoke all on function public.recruitment_campaign_block_reason(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.recruitment_campaign_block_reason(uuid,uuid,text,text,uuid) to service_role;

create function public.guard_initial_recruitment_campaign()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_project_id text; v_reason text; v_comments text;
begin
  if new.status <> 'pending' then return new; end if;
  -- Serializes aliases that race to create/retry sequences for the same mailbox.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.tenant_id::text || ':' || lower(btrim(new.email)), 0));
  v_project_id := new.campaign_snapshot->>'project_id';
  select p.comments into v_comments from public.people p where p.tenant_id = new.tenant_id and p.id = new.person_id;
  if v_project_id is null and position('[projet-lyon-neos-20261007]' in coalesce(v_comments, '')) > 0 then
    select pr.id::text into v_project_id from public.projects pr
      where pr.tenant_id = new.tenant_id and pr.status = 'open' and pr.archived_at is null
        and coalesce(pr.metadata->'lyon_development'->'person_ids', '[]'::jsonb) ? new.person_id::text
      order by pr.id limit 1;
  end if;
  v_reason := public.recruitment_campaign_block_reason(new.tenant_id,new.person_id,new.email,v_project_id,new.id);
  if v_reason is not null then
    raise exception 'CAMPAIGN_OVERLAP_BLOCKED: %', v_reason using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_initial_recruitment_campaign() from public, anon, authenticated;
create trigger guard_initial_recruitment_campaign
before insert or update of status,email on public.recruitment_email_sequences
for each row execute function public.guard_initial_recruitment_campaign();

-- Worker definition is copied from the existing engine, adding the guard before
-- a step is claimed/returned. A blocked record does not abort unrelated sends.
create or replace function public.claim_due_recruitment_email_steps(p_limit integer default 25)
returns setof public.recruitment_email_sequence_steps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.recruitment_email_sequence_steps;
  v_claimed public.recruitment_email_sequence_steps;
  v_sequence public.recruitment_email_sequences;
  v_person public.people;
  v_attempt_number integer;
  v_guard_reason text;
begin
  for v_step in
    select s.* from public.recruitment_email_sequence_steps s
    where s.status = 'scheduled' and s.scheduled_at <= now()
    order by s.scheduled_at, s.id
    for update of s skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  loop
    select * into v_sequence from public.recruitment_email_sequences where id = v_step.sequence_id for update;
    if v_sequence.id is null or v_sequence.status = 'stopped'
       or v_sequence.lifecycle_status in ('stopped', 'completed') then
      update public.recruitment_email_sequence_steps
      set status = 'cancelled', last_error = 'Séquence non exécutable' where id = v_step.id;
      continue;
    end if;

    select * into v_person from public.people where id = v_sequence.person_id;
    if v_person.id is null or not v_person.contact_allowed or v_person.do_not_contact then
      update public.recruitment_email_sequence_steps
      set status = 'cancelled', last_error = 'Contact interdit avant exécution' where id = v_step.id;
      update public.recruitment_email_sequences
      set status = 'stopped', lifecycle_status = 'stopped', next_action_at = null,
          stopped_at = coalesce(stopped_at, now()), stop_reason = 'contact_not_allowed'
      where id = v_sequence.id;
      continue;
    end if;

    v_guard_reason := public.recruitment_campaign_block_reason(
      v_sequence.tenant_id, v_sequence.person_id, v_sequence.email,
      v_sequence.campaign_snapshot->>'project_id', v_sequence.id);
    if v_guard_reason is not null then
      update public.recruitment_email_sequence_steps
      set status = 'error', last_error = 'CAMPAIGN_OVERLAP_BLOCKED: ' || v_guard_reason
      where id = v_step.id;
      update public.recruitment_email_sequences
      set lifecycle_status = 'error', next_action_at = null,
          last_error = 'CAMPAIGN_OVERLAP_BLOCKED: ' || v_guard_reason
      where id = v_sequence.id;
      continue;
    end if;

    update public.recruitment_email_sequence_steps
    set status = 'processing', claimed_at = now(), last_error = null
    where id = v_step.id returning * into v_claimed;

    select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
    from public.recruitment_email_sequence_attempts where step_id = v_step.id;

    insert into public.recruitment_email_sequence_attempts (
      tenant_id, sequence_id, step_id, person_id, attempt_number, status,
      claimed_at, idempotency_key
    ) values (
      v_step.tenant_id, v_step.sequence_id, v_step.id, v_step.person_id,
      v_attempt_number, 'processing', now(),
      'recruitment-email-attempt:' || v_step.id::text || ':' || v_attempt_number::text
    );

    update public.recruitment_email_sequences
    set lifecycle_status = 'running', current_step = v_step.step_index,
        next_action_at = null, last_attempt_at = now(), attempt_count = attempt_count + 1
    where id = v_sequence.id;

    return next v_claimed;
  end loop;
  return;
end;
$$;

