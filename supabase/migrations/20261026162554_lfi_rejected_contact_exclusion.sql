create or replace function public.lfi_claim_next(p_tenant uuid,p_project uuid)
returns setof public.lfi_outbox language plpgsql security invoker set search_path='' as $$
declare picked uuid; cfg public.lfi_campaigns; n_hour integer; n_day integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('lfi:'||p_tenant::text,0));
 select c.* into cfg from public.lfi_campaigns c join public.projects p on p.id=c.project_id and p.tenant_id=c.tenant_id
 where c.tenant_id=p_tenant and c.project_id=p_project and c.status='active' and p.status='open' and p.archived_at is null
 and c.mailbox_checked_at>now()-interval '5 minutes';
 if cfg.id is null then return; end if;
 select count(*) filter(where claimed_at>now()-interval '1 hour'),count(*) into n_hour,n_day
 from public.lfi_outbox where tenant_id=p_tenant and claimed_at>now()-interval '24 hours';
 if n_hour>=cfg.hourly_limit or n_day>=cfg.daily_limit then return; end if;
 if exists(select 1 from public.lfi_outbox where tenant_id=p_tenant and claimed_at>now()-interval '3 minutes') then return; end if;
 select o.id into picked from public.lfi_outbox o
 join public.lfi_recipients r on r.id=o.recipient_id and r.tenant_id=o.tenant_id
 join public.people p on p.id=r.person_id and p.tenant_id=r.tenant_id
 where r.campaign_id=cfg.id and r.status='ready' and o.status='queued' and o.due_at<=now()
 and p.contact_allowed and not p.do_not_contact and p.status not in ('archived','rejected')
 and lower(trim(p.primary_email))=r.email
 and left(p.postal_code,2) in ('75','77','78','91','92','93','94','95')
 and not exists(select 1 from public.lfi_suppressions s where s.tenant_id=p_tenant and s.email=r.email)
 and not exists(select 1 from public.lfi_outbox earlier where earlier.recipient_id=r.id and earlier.step<o.step and earlier.status<>'accepted')
 order by o.due_at,o.id limit 1 for update of o;
 if picked is null then return; end if;
 return query update public.lfi_outbox set status='claimed',claimed_at=now() where id=picked and status='queued' returning *;
end $$;
revoke all on function public.lfi_claim_next(uuid,uuid) from public,anon,authenticated;
grant execute on function public.lfi_claim_next(uuid,uuid) to service_role;
