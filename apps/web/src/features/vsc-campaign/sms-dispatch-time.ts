/** Bounded provider window for the 2026/2027 pilot; no automatic date shifting. */
export function isVscSmsDispatchTime(now:Date){
 if(!Number.isFinite(now.getTime()))return false;
 const p=new Intl.DateTimeFormat('en',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now);
 const part=(type:string)=>p.find(x=>x.type===type)!.value;const year=part('year'),date=`${part('month')}-${part('day')}`;
 const movable:Record<string,string[]>={'2026':['04-06','05-14','05-25'],'2027':['03-29','05-06','05-17']};
 if(!movable[year]||part('weekday')==='Sun'||Number(part('hour'))<8||Number(part('hour'))>=22)return false;
 return !['01-01','05-01','05-08','07-14','08-15','11-01','11-11','12-25',...movable[year]].includes(date);
}
