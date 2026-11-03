import {describe,expect,it} from 'vitest';
import {buildVscSmsCatchupReview} from './sms-catchup-review';
describe('unscheduled SMS catch-up copy review',()=>{
 it('prepares the historical email reminder without inventing a catch-up date or sending authority',()=>{const r=buildVscSmsCatchupReview('2026-11-03',113)!;expect(r).toMatchObject({count:113,scheduledDate:null,approvalRequired:true,sendingEnabled:false,promotional:true});expect(r.text).toContain('suite a notre email');expect(r.text).toContain('79 EUR HT au lieu de 159 EUR HT');expect(r.text).toContain("annonce jusqu'a la vente");expect(r.text).toContain('30 novembre 2026');expect(r.text.match(/STOP au \[STOP_CODE\]/g)).toHaveLength(1);expect(r.segments).toBeLessThanOrEqual(2);});
 it('does not create a proposal when no proven reminder is overdue',()=>{expect(buildVscSmsCatchupReview('2026-11-03',0)).toBeNull();});
 it('switches to a neutral message after the final promotional day',()=>{expect(buildVscSmsCatchupReview('2026-11-30',1)?.promotional).toBe(true);const r=buildVscSmsCatchupReview('2026-12-01',1)!;expect(r.promotional).toBe(false);expect(r.text).not.toMatch(/79|159|30 novembre/);expect(r.scheduledDate).toBeNull();});
 it('rejects invalid dates, impossible counts and truncated-size selections',()=>{for(const [date,count] of [['2026-02-30',1],['bad',1],['2026-11-03',-1],['2026-11-03',1000],['2026-11-03',1.5]] as const)expect(()=>buildVscSmsCatchupReview(date,count)).toThrow();});
});
