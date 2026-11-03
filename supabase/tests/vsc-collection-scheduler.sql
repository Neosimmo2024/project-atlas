-- Synthetic transaction only. HTTP requests stay in the queue until commit; this always rolls back.
\set ON_ERROR_STOP on
begin;
insert into public.tenants(id,name) values('29000000-0000-0000-0000-000000000001','VSC collection fixture'),('29000000-0000-0000-0000-000000000002','Foreign collection fixture');
insert into auth.users(id,email) values('19000000-0000-0000-0000-000000000001','collection-owner@fixture.invalid'),('19000000-0000-0000-0000-000000000002','collection-foreign@fixture.invalid');
insert into public.tenant_users(tenant_id,user_id,role_id) select t.id,t.u,r.id from (values('29000000-0000-0000-0000-000000000001'::uuid,'19000000-0000-0000-0000-000000000001'::uuid),('29000000-0000-0000-0000-000000000002','19000000-0000-0000-0000-000000000002')) t(id,u) cross join public.roles r where r.slug='owner';
do $$ declare r jsonb;q jsonb;k text:=repeat('a',64);stamp text;nonce_text text;expected text;begin
 r:=vsc_private.enqueue_collection();if r->>'state'<>'disabled' then raise exception 'Enabled by migration';end if;
 update vsc_private.collection_settings set tenant_id='29000000-0000-0000-0000-000000000001',actor_id='19000000-0000-0000-0000-000000000001',enabled=true where id;
 if not exists(select 1 from vault.secrets where name='vsc_collection_signing_key') then
  perform vault.create_secret(k,'vsc_collection_signing_key');
  r:=vsc_private.enqueue_collection();if r->>'state'<>'queued' then raise exception 'Not queued';end if;
  select headers into q from net.http_request_queue where id=(r->>'requestId')::bigint;
  if q is null or q::text like '%'||k||'%' or q ? 'authorization' then raise exception 'Signing key leaked to HTTP queue';end if;
  stamp:=q->>'x-vsc-timestamp';nonce_text:=q->>'x-vsc-nonce';
  expected:=encode(extensions.hmac('GET'||chr(10)||'/api/cron/vsc-collection'||chr(10)||stamp||chr(10)||nonce_text,k,'sha256'),'hex');
  if q->>'x-vsc-signature' is distinct from expected then raise exception 'Invalid signature';end if;
  r:=public.vsc_claim_collection('29000000-0000-0000-0000-000000000001',nonce_text::uuid,stamp,repeat('f',64));if r->>'state'<>'unauthorized' then raise exception 'Bad signature accepted';end if;
  r:=public.vsc_claim_collection('29000000-0000-0000-0000-000000000001',nonce_text::uuid,(stamp::bigint-301)::text,expected);if r->>'state'<>'unauthorized' then raise exception 'Stale signature accepted';end if;
  r:=public.vsc_claim_collection('29000000-0000-0000-0000-000000000002',nonce_text::uuid,stamp,expected);if r->>'state'<>'disabled' then raise exception 'Cross tenant signature accepted';end if;
  r:=public.vsc_claim_collection('29000000-0000-0000-0000-000000000001',nonce_text::uuid,stamp,expected);if r->>'state'<>'claimed' or r->>'actor'<>'19000000-0000-0000-0000-000000000001' then raise exception 'Signed claim failed';end if;
  r:=public.vsc_claim_collection('29000000-0000-0000-0000-000000000001',nonce_text::uuid,stamp,expected);if r->>'state'<>'not_eligible' then raise exception 'Signed replay accepted';end if;

  r:=vsc_private.enqueue_collection();if r->>'state'<>'already_pending' then raise exception 'Overlapping enqueue';end if;
  -- The outer rollback cancels this synthetic HTTP queue row before any request can run.
 end if;
end $$;
insert into vsc_private.collection_runs(nonce,tenant_id) values('49000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000001');
insert into vsc_private.collection_runs(nonce,tenant_id,requested_at) values('49000000-0000-0000-0000-000000000002','29000000-0000-0000-0000-000000000001',now()-interval '6 minutes');
insert into vsc_private.collection_runs(nonce,tenant_id) values('49000000-0000-0000-0000-000000000003','29000000-0000-0000-0000-000000000001');
set local role service_role;
do $$ declare t uuid:='29000000-0000-0000-0000-000000000001';a uuid:='19000000-0000-0000-0000-000000000001';n uuid:='49000000-0000-0000-0000-000000000001';s jsonb:='{"replies":"complete","historical":"complete","smsStops":"complete","repliesInspected":1,"repliesRecorded":0,"historicalInspected":1,"historicalHeld":0,"historicalCancelled":0,"sourceContacts":1,"sourceSmsBlocked":0,"unknownSmsStatus":0,"unmappedSources":0,"smsCancelled":0}';begin
 if public.vsc_begin_collection(t,'19000000-0000-0000-0000-000000000002',n) then raise exception 'Foreign actor accepted';end if;
 if public.vsc_begin_collection('29000000-0000-0000-0000-000000000002',a,n) then raise exception 'Foreign tenant accepted';end if;
 if public.vsc_begin_collection(t,a,'49000000-0000-0000-0000-000000000002') then raise exception 'Expired nonce accepted';end if;
 if not public.vsc_begin_collection(t,a,n) then raise exception 'Begin failed';end if;
 if public.vsc_begin_collection(t,a,n) then raise exception 'Replay accepted';end if;
 begin perform public.vsc_finish_collection(t,n,'complete',s||'{"unknownSmsStatus":1}');raise exception 'Unknown STOP reported complete';exception when raise_exception then if sqlerrm='Unknown STOP reported complete' then raise;end if;end;
 begin perform public.vsc_finish_collection(t,n,'complete',s||'{"private":"contact@fixture.invalid"}');raise exception 'Private field accepted';exception when raise_exception then if sqlerrm='Private field accepted' then raise;end if;end;
 if public.vsc_finish_collection('29000000-0000-0000-0000-000000000002',n,'complete',s) then raise exception 'Foreign finish accepted';end if;
 if not public.vsc_finish_collection(t,n,'complete',s) then raise exception 'Finish failed';end if;
 if public.vsc_finish_collection(t,n,'complete',s) then raise exception 'Journal overwritten';end if;
end $$;
reset role;
update public.tenant_users set role_id=(select id from public.roles where slug='reader') where tenant_id='29000000-0000-0000-0000-000000000001' and user_id='19000000-0000-0000-0000-000000000001';
set local role service_role;
do $$ begin if public.vsc_begin_collection('29000000-0000-0000-0000-000000000001','19000000-0000-0000-0000-000000000001','49000000-0000-0000-0000-000000000003') then raise exception 'Revoked actor accepted';end if;end $$;
reset role;
do $$begin
 if has_function_privilege('authenticated','public.vsc_claim_collection(uuid,uuid,text,text)','EXECUTE') or has_function_privilege('authenticated','public.vsc_begin_collection(uuid,uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.vsc_finish_collection(uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('service_role','vsc_private.enqueue_collection()','EXECUTE') then raise exception 'RPC exposed';end if;
 if has_function_privilege('authenticated','public.vsc_collection_status(uuid)','EXECUTE') or public.vsc_collection_status('29000000-0000-0000-0000-000000000002') is not null then raise exception 'Collection health leaked';end if;
 if has_schema_privilege('authenticated','vsc_private','USAGE') or has_table_privilege('service_role','vsc_private.collection_runs','INSERT') or has_table_privilege('service_role','vsc_private.collection_settings','UPDATE') then raise exception 'Private scheduler exposed';end if;
 if exists(select 1 from public.vsc_campaign_deliveries where tenant_id in ('29000000-0000-0000-0000-000000000001','29000000-0000-0000-0000-000000000002')) then raise exception 'Collection created delivery';end if;
end $$;
rollback;
