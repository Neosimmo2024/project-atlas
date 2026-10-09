-- Preserve existing initial-send idempotency through INSERT ON CONFLICT.
create or replace function public.guard_initial_recruitment_campaign()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_project_id text; v_reason text; v_comments text; v_sequence_id uuid;
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
  -- INSERT ... ON CONFLICT invokes the trigger before finding the existing row.
  -- Exclude the same person's existing sequence so stable-key replays/retries
  -- keep working, while a different person sharing the mailbox is still blocked.
  select s.id into v_sequence_id from public.recruitment_email_sequences s
    where s.tenant_id = new.tenant_id and s.person_id = new.person_id;
  v_reason := public.recruitment_campaign_block_reason(new.tenant_id,new.person_id,new.email,v_project_id,coalesce(v_sequence_id,new.id));
  if v_reason is not null then
    raise exception 'CAMPAIGN_OVERLAP_BLOCKED: %', v_reason using errcode = 'P0001';
  end if;
  return new;
end;
$$;
