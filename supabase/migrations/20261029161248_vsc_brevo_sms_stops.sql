-- Inbound SMS restrictions only. Never clears a STOP, sends, or changes email permissions.
create function public.vsc_apply_brevo_sms_stops(p_tenant_id uuid,p_actor_id uuid,p_source_ids bigint[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare matched integer; people_count integer:=0; cancelled integer:=0; person uuid;
begin
 if p_tenant_id is null or p_source_ids is null or cardinality(p_source_ids)>5000
  or exists(select 1 from unnest(p_source_ids) n where n is null or n<=0)
  or cardinality(p_source_ids)<>(select count(distinct n) from unnest(p_source_ids) n) then raise exception 'Invalid VSC SMS STOP batch'; end if;
 if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then raise exception 'VSC administrator required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
 select count(*) into matched from public.vsc_brevo_contact_links where tenant_id=p_tenant_id and provider_id=any(p_source_ids);
 update public.vsc_brevo_contact_links set sms_blocked=true,last_seen_at=now(),last_imported_by=p_actor_id,
  source_status_snapshot=source_status_snapshot||jsonb_build_object('sms_blocked',true,'sms_status_known',true,'sms_block_checked_at',now())
 where tenant_id=p_tenant_id and provider_id=any(p_source_ids);
 -- Apply both fresh and previously recorded blocks. Repeated calls also cancel newly queued aliases.
 for person in
  with stopped as (
   select l.person_id,l.identity_snapshot from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.sms_blocked
  ), mobiles as (
   select public.vsc_normalize_fr_mobile(p.primary_phone) as mobile from public.people p join stopped s on s.person_id=p.id where p.tenant_id=p_tenant_id
   union select public.vsc_normalize_fr_mobile(value) from stopped s cross join lateral jsonb_array_elements_text(s.identity_snapshot->'phones')
  )
  select p.id from public.people p where p.tenant_id=p_tenant_id and (
   p.id in(select person_id from stopped) or public.vsc_normalize_fr_mobile(p.primary_phone) in(select mobile from mobiles where mobile is not null))
 loop
  cancelled:=cancelled+public.vsc_unsubscribe_contact(p_tenant_id,person,'sms');people_count:=people_count+1;
 end loop;
 return jsonb_build_object('matchedSources',matched,'unmappedSources',cardinality(p_source_ids)-matched,'peopleStopped',people_count,'cancelled',cancelled);
end;
$$;
revoke all on function public.vsc_apply_brevo_sms_stops(uuid,uuid,bigint[]) from public,anon,authenticated;
grant execute on function public.vsc_apply_brevo_sms_stops(uuid,uuid,bigint[]) to service_role;
