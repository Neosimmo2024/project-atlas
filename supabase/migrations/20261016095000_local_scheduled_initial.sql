-- Complete an initial scheduled send through the existing claimed-step engine.
-- Privileges and the existing overlap/reply/permission guards stay unchanged.
create function public.complete_local_recruitment_initial(
  p_step_id uuid, p_success boolean, p_provider_message_id text default null, p_error text default null
) returns public.recruitment_email_sequence_steps
language plpgsql security definer set search_path = '' as $$
declare
  v_step public.recruitment_email_sequence_steps;
  v_sequence public.recruitment_email_sequences;
begin
  select * into v_step from public.recruitment_email_sequence_steps where id=p_step_id for update;
  select * into v_sequence from public.recruitment_email_sequences where id=v_step.sequence_id for update;
  if v_step.id is null or v_step.step_index <> 0
    or v_sequence.campaign_snapshot->>'key' is distinct from 'saint-maur-local-20261016' then
    raise exception 'INVALID_LOCAL_INITIAL_STEP';
  end if;
  if v_step.status='sent' then return v_step; end if;
  if v_sequence.status <> 'pending' or v_sequence.lifecycle_status in ('stopped','completed') then
    raise exception 'LOCAL_SEQUENCE_NOT_PENDING';
  end if;
  select * into v_step from public.complete_recruitment_email_step(p_step_id,p_success,p_provider_message_id,p_error);
  update public.recruitment_email_sequences set
    status=case when p_success then 'sent' else 'error' end,
    sent_at=case when p_success then v_step.sent_at else null end
    where id=v_sequence.id;
  return v_step;
end;
$$;
revoke all on function public.complete_local_recruitment_initial(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.complete_local_recruitment_initial(uuid,boolean,text,text) to service_role;
