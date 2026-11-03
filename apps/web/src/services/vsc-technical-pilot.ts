/** Preparation only: verifies connections and returns fixed technical copies. Never sends. */
import type {TenantContext} from '@/types/domain';
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
import {canManageOvh,verifyOvhConnection,OVH_SENDER} from './ovh-connection';
import {inspectVscBrevoSmsAccount} from './vsc-brevo-sms-status';
import {estimateVscSms} from '@/features/vsc-campaign/sms-content';
export async function prepareVscTechnicalPilot(context:TenantContext){
 assertVscBrevoImportEnvironment();
 if(!canManageOvh(context))throw new Error('Entreprise non autorisée');
 const {data,error}=await createSupabaseServiceRoleClient().rpc('vsc_technical_pilot_status',{p_tenant_id:context.tenantId,p_actor_id:context.userId});
 if(error||!data||data.readOnly!==true||data.sendingEnabled!==false||typeof data.emailMasked!=='string'||typeof data.mobileMasked!=='string'||!Number.isFinite(Date.parse(data.confirmedAt)))throw new Error('Coordonnées de test non confirmées');
 const [smtp,brevo]=await Promise.all([verifyOvhConnection(context),inspectVscBrevoSmsAccount(context.tenantId)]);
 const text='TEST VendreSonCommerce : verification technique Atlas sur votre mobile de test. Ce message ne fait partie d aucune campagne commerciale. STOP au [STOP_CODE]';
 return {readOnly:true as const,sendingEnabled:false as const,checkedAt:new Date().toISOString(),
  targets:{emailMasked:data.emailMasked as string,mobileMasked:data.mobileMasked as string,confirmedAt:data.confirmedAt as string},
  email:{sender:OVH_SENDER,connectionVerified:smtp.success,subject:'[TEST ATLAS VSC] Verification technique email',text:'Bonjour Renato,\n\nCeci est un test technique de la connexion OVH VendreSonCommerce vers votre adresse de test. Il ne fait partie d’aucune campagne commerciale.\n\nAprès réception du test autorisé, répondez à ce message pour vérifier la collecte de la réponse dans Atlas.\n\nL’équipe VendreSonCommerce'},
  sms:{sender:'VDC',accountVerified:brevo.state==='identity_verified',text,...estimateVscSms(text)},
  maximumMessages:{email:1,sms:1},approvalRequired:true as const};
}
