/** Final promotional day draft preparation only. Does not approve, schedule a provider, or send. */
import {createHash,timingSafeEqual} from 'node:crypto';
import {createSupabaseServiceRoleClient} from '@/lib/supabase/service-role';
import {assertVscBrevoImportEnvironment} from './vsc-brevo-contact-import';
import {defaultVscEmailContent} from '@/features/vsc-campaign/email-content';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function authorize(tenant:string){if(!UUID.test(tenant)||tenant!==process.env.VSC_OVH_TENANT_ID?.trim())throw new Error('Entreprise non autorisée');assertVscBrevoImportEnvironment();}
async function prepare(tenant:string){authorize(tenant);const {data,error}=await createSupabaseServiceRoleClient().rpc('vsc_last_day_contacts',{p_tenant_id:tenant});if(error||!Array.isArray(data)||data.length>=1000)throw new Error('Relance historique indisponible ou trop volumineuse');
 const contacts=data as {id:string;display_name:string;email:string;scheduled_at:string}[];
 if(contacts.some(c=>!UUID.test(c.id)||typeof c.email!=='string'||Date.parse(c.scheduled_at)!==Date.parse('2026-11-30T08:30:00Z')))throw new Error('Historique incohérent');
 const content=defaultVscEmailContent();const finalMessage=content.messages.find(m=>m.stepKey==='last-chance')!;
 finalMessage.subject='Dernier jour : votre annonce jusqu’à la vente à 79 € HT';
 finalMessage.text='Bonjour,\n\nAujourd’hui, 30 novembre 2026, est le dernier jour pour profiter de notre offre à 79 € HT au lieu de 159 € HT.\n\nAvec VendreSonCommerce, votre annonce reste publiée jusqu’à la vente.\n\nVous avez un projet de cession de commerce ? Répondez à cet email pour échanger sur la publication de votre annonce.\n\nBien cordialement,\nL’équipe VendreSonCommerce\ncontact@vendresoncommerce.com';const key=createHash('sha256').update(JSON.stringify({tenant,contacts,content})).digest('hex');return {contacts,content,key};}
export async function previewVscLastDayDraft(tenant:string){const p=await prepare(tenant);const dates=[...new Set(p.contacts.map(c=>c.scheduled_at))].sort();return {count:p.contacts.length,lots:Math.ceil(p.contacts.length/100),dates,reviewKey:p.key,message:p.content.messages.find(m=>m.stepKey==='last-chance')!,sendingEnabled:false as const};}
export async function saveVscLastDayDraft(tenant:string,actor:string,key:unknown){authorize(tenant);if(!UUID.test(actor)||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw new Error('Aperçu invalide');const p=await prepare(tenant);if(!timingSafeEqual(Buffer.from(key,'hex'),Buffer.from(p.key,'hex')))throw new Error('L’aperçu a changé : rechargez-le avant de sauvegarder');
 const db=createSupabaseServiceRoleClient();const campaigns:string[]=[];let submitted=0;
 for(let offset=0;offset<p.contacts.length;offset+=100){const contacts=p.contacts.slice(offset,offset+100);const h=createHash('sha256').update(`vsc-last-day:${tenant}:2:${contacts.map(c=>c.id).join(',')}`).digest('hex');const id=`${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
 const {data,error}=await db.rpc('vsc_save_last_day_draft',{p_tenant_id:tenant,p_actor_id:actor,p_campaign_id:id,p_name:`VSC — Dernier jour OVH 30 novembre — lot ${offset/100+1}`,p_plan:contacts.map(c=>({id:c.id,email:c.email,scheduled_at:c.scheduled_at})),p_content:p.content});
 if(error||!data||data.submitted!==contacts.length)throw new Error('Sauvegarde interrompue. Des lots peuvent être conservés : rechargez l’aperçu pour reprendre les seuls contacts restants. Aucun envoi lancé.');campaigns.push(id);submitted+=data.submitted;}
 return {campaigns,submitted,sendingEnabled:false as const};}
