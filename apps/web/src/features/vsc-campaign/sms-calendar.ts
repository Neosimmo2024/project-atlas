/** Review-only calendar. No contacts, persistence, provider calls or sending authority. */
import { isVscSmsDispatchTime } from './sms-dispatch-time';
import { isVscCalendarDate, VSC_OFFER_END } from './policy';
import { defaultVscSmsContent, estimateVscSms } from './sms-content';
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const neutral = "Vous envisagez de vendre ou louer votre commerce ? Decouvrez les forfaits VendreSonCommerce pour publier votre annonce jusqu'a la vente : vendresoncommerce.com STOP au [STOP_CODE]";
const finalNeutral = "Dernier message de VendreSonCommerce : votre projet de vente de commerce est-il toujours d'actualite ? Decouvrez nos forfaits pour une annonce jusqu'a la vente. vendresoncommerce.com STOP au [STOP_CODE]";
export function buildVscSmsCalendar(input: {today: string; startDate: string; historicalEmailDates: (string | null)[]; mobileOnly: number}) {
  if (!isVscCalendarDate(input.today) || !isVscCalendarDate(input.startDate) || input.startDate < input.today || input.startDate > VSC_OFFER_END)
    throw new Error('Choisissez un départ entre aujourd’hui et le 30 novembre 2026.');
  if (!Number.isSafeInteger(input.mobileOnly) || input.mobileOnly < 0 || input.mobileOnly + input.historicalEmailDates.length > 999)
    throw new Error('Effectif SMS invalide');
  const reminders = new Map<string, number>();
  let unknownHistory = 0;
  for (const date of input.historicalEmailDates) {
    if (date === null) { unknownHistory++; continue; }
    if (!isVscCalendarDate(date) || date > input.today) throw new Error('Historique email invalide');
    const dueDate = addDays(date, 5);
    reminders.set(dueDate, (reminders.get(dueDate) ?? 0) + 1);
  }
  const emailReminders = [...reminders].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,count,overdue:date<input.today}));
  const copies = defaultVscSmsContent();
  const mobileOnlySteps = [0,15,30,45,60].map((offset,index)=>{
    const date = addDays(input.startDate, offset);
    const promotional = date <= VSC_OFFER_END;
    const key = ['sms-initial','sms-followup-1','sms-followup-2','sms-followup-3'][index];
    const text = index === 4 ? finalNeutral : promotional ? copies.find(c=>c.stepKey===key)!.text : neutral;
    return {offsetDays:offset,date,providerDayAllowed:isVscSmsDispatchTime(new Date(`${date}T12:00:00Z`)),count:input.mobileOnly,promotional,text,...estimateVscSms(text)};
  });
  return {today:input.today,startDate:input.startDate,emailMobile:input.historicalEmailDates.length,mobileOnly:input.mobileOnly,
    overdueReminders:emailReminders.filter(r=>r.overdue).reduce((n,r)=>n+r.count,0),unknownHistory,emailReminders,mobileOnlySteps,
    sendingEnabled:false as const,readOnly:true as const};
}
