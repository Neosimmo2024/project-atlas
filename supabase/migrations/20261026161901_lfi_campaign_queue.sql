-- LFI only. No changes to Brevo/recruitment tables or cron jobs.
create table public.lfi_campaigns (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 project_id uuid not null references public.projects(id),
 status text not null default 'draft' check(status in ('draft','active','paused','completed')),
 sender text not null default 'contact@lesformateursimmo.com' check(sender='contact@lesformateursimmo.com'),
 hourly_limit integer not null default 20 check(hourly_limit between 1 and 100),
 daily_limit integer not null default 100 check(daily_limit between 1 and 500),
 mailbox_checked_at timestamptz, mailbox_uidvalidity text, mailbox_last_uid bigint not null default 0, created_at timestamptz not null default now(),
 unique(id,tenant_id), unique(tenant_id,project_id)
);
create table public.lfi_suppressions (
 tenant_id uuid not null references public.tenants(id), email text not null check(email=lower(trim(email))),
 reason text not null check(reason in ('unsubscribed','replied','bounced','registered','manual')),
 created_at timestamptz not null default now(), primary key(tenant_id,email)
);
create table public.lfi_recipients (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
 campaign_id uuid not null, person_id uuid not null references public.people(id),
 email text not null check(email=lower(trim(email))),
 unsubscribe_token text not null unique check(length(unsubscribe_token)=64),
 status text not null default 'ready' check(status in ('ready','stopped')),
 created_at timestamptz not null default now(),
 foreign key(campaign_id,tenant_id) references public.lfi_campaigns(id,tenant_id),
 unique(campaign_id,email),unique(id,tenant_id)
);
create table public.lfi_outbox (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, recipient_id uuid not null,
 step integer not null check(step between 1 and 4), due_at timestamptz not null,
 subject text not null, body_text text not null,
 status text not null default 'queued' check(status in ('queued','claimed','accepted','uncertain','cancelled')),
 claimed_at timestamptz, completed_at timestamptz,
 message_id text not null unique,
 foreign key(recipient_id,tenant_id) references public.lfi_recipients(id,tenant_id),
 unique(recipient_id,step)
);
create index lfi_outbox_due_idx on public.lfi_outbox(tenant_id,due_at) where status='queued';
create index lfi_outbox_claimed_idx on public.lfi_outbox(tenant_id,claimed_at) where claimed_at is not null;
alter table public.lfi_campaigns enable row level security;
alter table public.lfi_suppressions enable row level security;
alter table public.lfi_recipients enable row level security;
alter table public.lfi_outbox enable row level security;
revoke all on public.lfi_campaigns,public.lfi_suppressions,public.lfi_recipients,public.lfi_outbox from public,anon,authenticated;
grant select,insert,update on public.lfi_campaigns,public.lfi_suppressions,public.lfi_recipients,public.lfi_outbox to service_role;

-- All exclusions immediately cancel queued follow-ups for this LFI identity.
create function public.lfi_stop_recipient(p_tenant uuid,p_email text,p_reason text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('lfi:'||p_tenant::text,0));
 insert into public.lfi_suppressions(tenant_id,email,reason) values(p_tenant,lower(trim(p_email)),p_reason)
 on conflict(tenant_id,email) do nothing;
 update public.lfi_recipients set status='stopped' where tenant_id=p_tenant and email=lower(trim(p_email));
 update public.lfi_outbox o set status='cancelled',completed_at=now()
 where o.tenant_id=p_tenant and o.status='queued' and exists(select 1 from public.lfi_recipients r where r.id=o.recipient_id and r.status='stopped');
end $$;
revoke all on function public.lfi_stop_recipient(uuid,text,text) from public,anon,authenticated;
grant execute on function public.lfi_stop_recipient(uuid,text,text) to service_role;

-- Atomic global sender throttle. Uncertain/claimed sends consume quota and never retry.
create function public.lfi_claim_next(p_tenant uuid,p_project uuid)
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
 and p.contact_allowed and not p.do_not_contact and p.status<>'archived'
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
