-- The application never receives the signing key. Only its service connection can
-- ask the database to verify a short-lived signature and atomically consume a nonce.
create function public.vsc_claim_collection(p_tenant_id uuid,p_nonce uuid,p_timestamp text,p_signature text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s vsc_private.collection_settings%rowtype;k text;expected text;
begin
 select * into s from vsc_private.collection_settings where id;
 if not found or not s.enabled or s.tenant_id is distinct from p_tenant_id then return jsonb_build_object('state','disabled');end if;
 if p_timestamp is null or p_timestamp !~ '^[0-9]{10}$' or p_signature is null or p_signature !~ '^[a-f0-9]{64}$' or p_nonce is null then return jsonb_build_object('state','unauthorized');end if;
 if abs(extract(epoch from now())-p_timestamp::bigint)>300 then return jsonb_build_object('state','unauthorized');end if;
 select decrypted_secret into k from vault.decrypted_secrets where name='vsc_collection_signing_key';
 if k is null or k !~ '^[a-f0-9]{64}$' then return jsonb_build_object('state','disabled');end if;
 expected:=encode(extensions.hmac('GET'||chr(10)||'/api/cron/vsc-collection'||chr(10)||p_timestamp||chr(10)||p_nonce::text,k,'sha256'),'hex');
 -- Compare blinded MACs, rather than a prefix-dependent comparison of the supplied MAC.
 if extensions.hmac('verify:'||expected,k,'sha256') is distinct from extensions.hmac('verify:'||p_signature,k,'sha256') then return jsonb_build_object('state','unauthorized');end if;
 if not public.vsc_begin_collection(p_tenant_id,s.actor_id,p_nonce) then return jsonb_build_object('state','not_eligible');end if;
 return jsonb_build_object('state','claimed','actor',s.actor_id);
end;
$$;
revoke all on function public.vsc_claim_collection(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.vsc_claim_collection(uuid,uuid,text,text) to service_role;
