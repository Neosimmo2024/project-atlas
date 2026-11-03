/** One explicit technical submission per channel, authorized in the private QA ledger. Never retries. */
import type {TenantContext} from '@/types/domain';
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {createOvhTransport,OVH_SENDER,canManageOvh} from './ovh-connection';
import {prepareVscTechnicalPilot} from './vsc-technical-pilot';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
import {classifyVscSmtpReceipt,classifyVscSmtpError} from '@/features/vsc-campaign/smtp-outcome';
import {estimateVscSms} from '@/features/vsc-campaign/sms-content';
import {isVscSmsDispatchTime} from '@/features/vsc-campaign/sms-dispatch-time';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type State='accepted'|'rejected'|'unknown';
export async function sendVscPersonalTest(context:TenantContext,channel:'email'|'sms'){
 assertVscBrevoImportEnvironment();
 if(!canManageOvh(context)||!['email','sms'].includes(channel))throw new Error('Test non autorisé');
 const preview=await prepareVscTechnicalPilot(context);
 const password=process.env.VSC_OVH_SMTP_PASSWORD,key=process.env.BREVO_VSC_API_KEY?.trim();
 if(channel==='email'?(!preview.email.connectionVerified||!password):(!preview.sms.accountVerified||!key||!isVscSmsDispatchTime(new Date())))return {state:'blocked' as const,commercialSendingEnabled:false as const};
 const db=createSupabaseServiceRoleClient();
 const claim=await db.rpc('vsc_claim_personal_test',{p_tenant_id:context.tenantId,p_actor_id:context.userId,p_channel:channel,p_confirmed_at:preview.targets.confirmedAt});
 if(claim.error)throw new Error('Réservation du test non confirmée');
 if(!claim.data)return {state:'not_eligible' as const,commercialSendingEnabled:false as const};
 const {id,recipient}=claim.data;
 if(!UUID.test(id)||claim.data.channel!==channel||typeof recipient!=='string'||(channel==='email'?!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(recipient):!/^\+33[67][0-9]{8}$/.test(recipient)))throw new Error('Réservation incohérente');
 let state:State='unknown',reference:string|null=null,reason:string|undefined;
 if(channel==='email'){
  const messageId=`<atlas-vsc-test-${id}@vendresoncommerce.com>`;
  let transport:ReturnType<typeof createOvhTransport>|undefined;
  try{transport=createOvhTransport(password!);const receipt=await transport.sendMail({from:{name:'VendreSonCommerce',address:OVH_SENDER},replyTo:OVH_SENDER,to:recipient,envelope:{from:OVH_SENDER,to:[recipient]},messageId,subject:preview.email.subject,text:preview.email.text});const outcome=classifyVscSmtpReceipt(receipt,recipient,messageId);state=outcome==='sent'?'accepted':outcome;if(state==='accepted')reference=messageId;}
  catch(error){const outcome=classifyVscSmtpError(error);state=outcome==='sent'?'unknown':outcome;}finally{try{transport?.close();}catch{/* Never turn an accepted receipt into a retry. */}}
 }else{
  try{
   const response=await fetch('https://api.brevo.com/v3/transactionalSMS/send',{method:'POST',headers:{'api-key':key!,accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({sender:'VDC',recipient:recipient.slice(1),content:preview.sms.text,unicodeEnabled:estimateVscSms(preview.sms.text).encoding==='Unicode',tag:`vsc-test-${id}`}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
   if(response.status===201){const receipt=await response.json();if(Number.isSafeInteger(receipt?.messageId)&&receipt.messageId>0){state='accepted';reference=String(receipt.messageId);}}
   else if([400,401,402,403].includes(response.status)){const body=await response.json();if(['invalid_parameter','missing_parameter','unauthorized','not_enough_credits','permission_denied'].includes(body?.code)){state='rejected';reason=body.code==='not_enough_credits'?'insufficient_sms_credits':'provider_rejection';}}
  }catch{/* Unknown submission outcome: ledger stays locked, never retry. */}
 }
 const finish=await db.rpc('vsc_finish_personal_test',{p_tenant_id:context.tenantId,p_actor_id:context.userId,p_id:id,p_state:state,p_reference:reference});
 if(finish.error||finish.data!==true)throw new Error('Résultat du test non confirmé ; aucun renvoi');
 return {state,...(reason?{reason}:{}),commercialSendingEnabled:false as const};
}
