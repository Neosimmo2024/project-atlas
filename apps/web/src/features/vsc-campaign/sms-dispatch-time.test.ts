import {describe,expect,it} from 'vitest';import {isVscSmsDispatchTime} from './sms-dispatch-time';
describe('VSC provider SMS window',()=>{
 it('uses Paris boundaries and refuses Sundays, holidays and unsupported years without rescheduling',()=>{for(const date of ['2026-11-02T07:00:00Z','2026-07-15T06:00:00Z'])expect(isVscSmsDispatchTime(new Date(date))).toBe(true);for(const date of ['bad','2026-11-02T06:59:59Z','2026-11-02T21:00:00Z','2026-11-08T09:00:00Z','2026-11-11T09:00:00Z','2027-01-01T09:00:00Z','2027-03-29T09:00:00Z','2028-02-01T09:00:00Z'])expect(isVscSmsDispatchTime(new Date(date))).toBe(false);});
});
