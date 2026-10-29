-- Historical inbound holds are not verified thread replies or opt-outs.
create table public.vsc_historical_inbound_holds(
 tenant_id uuid not null, message_id text not null check(length(message_id)<=502 and message_id ~ '^<[^<>[:space:]]+>$'),
 person_id uuid not null, source_email text not null, received_at timestamptz not null,
 created_at timestamptz not null default now(),
 primary key(tenant_id,message_id),
 foreign key(tenant_id,person_id) references public.people(tenant_id,id)
);
create index vsc_historical_hold_person_idx on public.vsc_historical_inbound_holds(tenant_id,person_id);
alter table public.vsc_historical_inbound_holds enable row level security;
revoke all on public.vsc_historical_inbound_holds from public,anon,authenticated,service_role;
grant select,insert on public.vsc_historical_inbound_holds to service_role;
grant select on public.vsc_historical_inbound_holds to authenticated;
create policy vsc_historical_holds_admin_read on public.vsc_historical_inbound_holds for select to authenticated using(exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=vsc_historical_inbound_holds.tenant_id and tu.user_id=(select auth.uid()) and tu.status='active' and r.slug in ('owner','admin')));
create table public.vsc_historical_imap_cursors(
 tenant_id uuid primary key references public.tenants(id),
 uid_validity text check(uid_validity ~ '^[1-9][0-9]*$'),
 last_uid bigint not null default 0 check(last_uid between 0 and 4294967295),
 version integer not null default 0 check(version>=0),updated_at timestamptz not null default now(),
 check(uid_validity is not null or last_uid=0)
);
alter table public.vsc_historical_imap_cursors enable row level security;
revoke all on public.vsc_historical_imap_cursors from public,anon,authenticated,service_role;
grant select,insert,update on public.vsc_historical_imap_cursors to service_role;

create function public.vsc_apply_historical_inbound_batch(p_tenant_id uuid,p_actor_id uuid,p_version integer,p_uid_validity text,p_last_uid bigint,p_messages jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare cursor_row public.vsc_historical_imap_cursors%rowtype;m jsonb;person uuid;sender text;received timestamptz;mid text;old public.vsc_historical_inbound_holds%rowtype;added integer:=0;cancelled integer:=0;n integer;
begin
 if not exists(select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin')) then raise exception 'VSC administrator required';end if;
 if p_version is null or p_version<0 or p_uid_validity is null or p_uid_validity !~ '^[1-9][0-9]*$' or p_last_uid is null or p_last_uid not between 0 and 4294967295 or jsonb_typeof(p_messages) is distinct from 'array' then raise exception 'Invalid historical batch';end if;
 if jsonb_array_length(p_messages)>200 or pg_column_size(p_messages)>500000 then raise exception 'Historical batch too large';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text,1077));
 select * into cursor_row from public.vsc_historical_imap_cursors where tenant_id=p_tenant_id for update;
 if not found or cursor_row.version<>p_version or (cursor_row.uid_validity is not null and cursor_row.uid_validity<>p_uid_validity) or p_last_uid<cursor_row.last_uid then raise exception 'Historical checkpoint conflict';end if;
 for m in select value from jsonb_array_elements(p_messages) loop
  person:=(m->>'personId')::uuid;sender:=m->>'from';received:=(m->>'receivedAt')::timestamptz;mid:=m->>'messageId';
  if person is null or sender is null or mid is null or (length(mid)>502 or mid !~ '^<[^<>[:space:]]+>$') or received is null or not isfinite(received) or received>now()+interval '5 minutes' then raise exception 'Invalid historical message';end if;
  -- Recheck source history and ambiguity in the same transaction as the hold.
  if not exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.person_id=person and l.source_email=sender and l.history_campaign_2->>'sentAt' is not null and (l.history_campaign_2->>'sentAt')::timestamptz<=received)
   or exists(select 1 from public.vsc_brevo_contact_links l where l.tenant_id=p_tenant_id and l.source_email=sender and l.person_id is distinct from person and l.history_campaign_2->>'sentAt' is not null)
   then raise exception 'Unrecognized or ambiguous historical sender';end if;
  insert into public.vsc_historical_inbound_holds(tenant_id,message_id,person_id,source_email,received_at) values(p_tenant_id,mid,person,sender,received) on conflict do nothing;
  get diagnostics n=row_count;added:=added+n;
  select * into old from public.vsc_historical_inbound_holds where tenant_id=p_tenant_id and message_id=mid;
  if old.person_id<>person or old.source_email<>sender or old.received_at<>received then raise exception 'Historical message identity conflict';end if;
  -- Shared suppression guard blocks future reservations and stale draft saves too.
  -- This is an operational hold, with its reason in the separate immutable journal.
  insert into public.vsc_contact_suppressions(tenant_id,person_id,channel)
   select p_tenant_id,p.id,'all' from public.people p where p.tenant_id=p_tenant_id and (p.id=person or lower(p.primary_email)=sender or (public.vsc_normalize_fr_mobile(p.primary_phone) is not null and public.vsc_normalize_fr_mobile(p.primary_phone)=(select public.vsc_normalize_fr_mobile(primary_phone) from public.people where tenant_id=p_tenant_id and id=person))) on conflict do nothing;
 end loop;
 update public.vsc_campaign_deliveries d set status='cancelled' where d.tenant_id=p_tenant_id and d.status in ('draft','scheduled') and exists(select 1 from public.vsc_contact_suppressions s where s.tenant_id=d.tenant_id and s.person_id=d.person_id and s.channel='all') and exists(select 1 from public.vsc_historical_inbound_holds h join public.people hp on hp.tenant_id=h.tenant_id and hp.id=h.person_id join public.people dp on dp.tenant_id=d.tenant_id and dp.id=d.person_id where h.tenant_id=d.tenant_id and (h.person_id=d.person_id or lower(dp.primary_email)=h.source_email or (public.vsc_normalize_fr_mobile(dp.primary_phone) is not null and public.vsc_normalize_fr_mobile(dp.primary_phone)=public.vsc_normalize_fr_mobile(hp.primary_phone))));
 get diagnostics cancelled=row_count;
 update public.vsc_historical_imap_cursors set uid_validity=p_uid_validity,last_uid=p_last_uid,version=version+1,updated_at=now() where tenant_id=p_tenant_id;
 return jsonb_build_object('held',added,'cancelled',cancelled,'version',p_version+1);
end $$;
revoke all on function public.vsc_apply_historical_inbound_batch(uuid,uuid,integer,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.vsc_apply_historical_inbound_batch(uuid,uuid,integer,text,bigint,jsonb) to service_role;
