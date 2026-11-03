/** Inert until explicitly enabled. No route/UI/scheduler invokes this adapter. Never retries. */
import {reserveVscSms,beginVscSms,refreshVscSms,releaseVscSms,recordVscSms,type VscSmsPayload} from './vsc-sms-reservations';
import {inspectVscBrevoSmsAccount} from './vsc-brevo-sms-status';
import {syncVscBrevoSmsStops} from './vsc-brevo-sms-stops';
import {estimateVscSms} from '@/features/vsc-campaign/sms-content';
import {isVscSmsDispatchTime} from '@/features/vsc-campaign/sms-dispatch-time';
import {isVscOfferCurrent} from '@/features/vsc-campaign/policy';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result={state:'disabled'|'blocked'|'not_eligible'|'accepted'|'rejected'|'review_required';reason?:string};
function valid(p:VscSmsPayload,id:string){return !!p&&p.deliveryId===id&&UUID.test(p.campaignId)&&UUID.test(p.personId)&&/^\+33[67][0-9]{8}$/.test(p.recipient)&&p.sender==='VDC'&&typeof p.promotional==='boolean'&&typeof p.text==='string'&&p.text.trim().length>0&&p.text.length<=2000&&estimateVscSms(p.text).segments<=2&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(p.text)&&p.text.includes('VendreSonCommerce')&&p.text.split('STOP au [STOP_CODE]').length===2&&p.text.split('[STOP_CODE]').length===2&&(!p.promotional?!/(^|\D)(79|159)(\D|$)/.test(p.text):isVscOfferCurrent(new Date()));}
function same(a:VscSmsPayload,b:VscSmsPayload|null){return !!b&&(['deliveryId','campaignId','personId','recipient','text','promotional','sender'] as const).every(k=>a[k]===b[k]);}
export async function dispatchReservedVscSms(tenant:string,id:string,actor:string):Promise<Result>{
 if(process.env.VSC_SMS_DISPATCH_ENABLED!=='true')return {state:'disabled'};
 if(!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim()||!UUID.test(id)||!UUID.test(actor)||!isVscSmsDispatchTime(new Date()))return {state:'blocked',reason:'configuration_or_window'};
 const key=process.env.BREVO_VSC_API_KEY?.trim();if(!key)return {state:'blocked',reason:'missing_dedicated_key'};
 let reservation;try{reservation=await reserveVscSms(tenant,id);}catch{return {state:'review_required',reason:'reservation_unconfirmed'};}
 if(!reservation)return {state:'not_eligible'};
 const token=reservation.claimToken;
 try{if(reservation.deliveryId!==id||!UUID.test(token)||!valid(reservation.payload,id)||(await inspectVscBrevoSmsAccount(tenant)).state!=='identity_verified')throw new Error('Invalid preflight');
 const stops=await syncVscBrevoSmsStops(tenant,actor);if(stops.unknownSmsStatus!==0)throw new Error('Incomplete STOP check');
 }catch{try{return await releaseVscSms(tenant,id,token)?{state:'blocked',reason:'preflight_failed'}:{state:'review_required',reason:'release_unconfirmed'};}catch{return {state:'review_required',reason:'release_unconfirmed'};}}
 async function record(outcome:'sent'|'rejected'|'unknown',messageId?:string):Promise<Result>{try{if(!await recordVscSms(tenant,id,token,outcome,messageId))return {state:'review_required',reason:'result_unrecorded'};return {state:outcome==='sent'?'accepted':outcome==='unknown'?'review_required':'rejected'};}catch{return {state:'review_required',reason:'result_unconfirmed'};}}
 async function blocked(reason:string):Promise<Result>{const result=await record('rejected');return result.state==='rejected'?{state:'blocked',reason}:result;}
 let begun;try{begun=await beginVscSms(tenant,id,token);}catch{return {state:'review_required',reason:'begin_unconfirmed'};}
 if(!begun)return {state:'blocked',reason:'start_refused'};
 try{const fresh=await refreshVscSms(tenant,id,token);if(!same(reservation.payload,begun)||!same(reservation.payload,fresh)||!valid(reservation.payload,id)||process.env.VSC_SMS_DISPATCH_ENABLED!=='true'||process.env.BREVO_VSC_API_KEY?.trim()!==key||!isVscSmsDispatchTime(new Date()))return blocked('guard_changed_before_provider');}catch{return blocked('guard_unavailable_before_provider');}
 let response:Response;
 try{response=await fetch('https://api.brevo.com/v3/transactionalSMS/send',{method:'POST',headers:{'api-key':key,accept:'application/json','Content-Type':'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000),body:JSON.stringify({sender:'VDC',recipient:reservation.payload.recipient.slice(1),content:reservation.payload.text,unicodeEnabled:estimateVscSms(reservation.payload.text).encoding==='Unicode',tag:`vsc-${id}`})});}catch{return record('unknown');}
 // HTTP acceptance is not delivery. A timeout, invalid receipt, 5xx or unexpected status remains locked.
 if(response.status===201){try{const receipt=await response.json();if(Number.isSafeInteger(receipt?.messageId)&&receipt.messageId>0)return record('sent',String(receipt.messageId));}catch{/* Unknown, never retry. */}return record('unknown');}
 if([400,401,402,403].includes(response.status)){try{const body=await response.json();if(typeof body?.code==='string'&&['invalid_parameter','missing_parameter','unauthorized','not_enough_credits','permission_denied'].includes(body.code))return record('rejected');}catch{/* Unknown, never retry. */}}
 return record('unknown');
}
