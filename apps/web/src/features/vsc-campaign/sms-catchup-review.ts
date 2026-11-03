/** Unscheduled copy proposal only. No recipient identities, persistence or dispatch. */
import {defaultVscSmsContent,estimateVscSms} from './sms-content';
import {isVscCalendarDate,VSC_OFFER_END} from './policy';
export function buildVscSmsCatchupReview(today:string,count:number){
 if(!isVscCalendarDate(today)||!Number.isSafeInteger(count)||count<0||count>999)throw new Error('Relecture de rattrapage invalide');
 if(count===0)return null;
 const promotional=today<=VSC_OFFER_END;
 const text=promotional?defaultVscSmsContent().find(m=>m.stepKey==='sms-reminder')!.text:
  "VendreSonCommerce : suite a notre email, votre projet de vente de commerce est-il toujours d'actualite ? Decouvrez nos forfaits pour une annonce jusqu'a la vente. vendresoncommerce.com STOP au [STOP_CODE]";
 return {count,text,promotional,...estimateVscSms(text),scheduledDate:null,approvalRequired:true as const,sendingEnabled:false as const};
}
