-- Server-only access to the exact personal SMS receipt; no claim, mutation or resend.
create function public.vsc_personal_sms_receipt(p_tenant_id uuid,p_actor_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',a.id,'state',a.state,'startedAt',a.started_at,'reference',a.provider_reference,'mobile',t.mobile)
 from vsc_private.technical_pilot_attempts a join vsc_private.technical_pilot_targets t on t.tenant_id=a.tenant_id and t.confirmed_by=a.approved_by and t.confirmed_at=a.target_confirmed_at
 where a.tenant_id=p_tenant_id and a.approved_by=p_actor_id and a.channel='sms' and exists(
 select 1 from public.tenant_users tu join public.roles r on r.id=tu.role_id where tu.tenant_id=p_tenant_id and tu.user_id=p_actor_id and tu.status='active' and r.slug in ('owner','admin'));
$$;
revoke all on function public.vsc_personal_sms_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vsc_personal_sms_receipt(uuid,uuid) to service_role;
