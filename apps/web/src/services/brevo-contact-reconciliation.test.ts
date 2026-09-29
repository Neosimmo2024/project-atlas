import { describe, it, expect, vi } from "vitest";
import { assessBrevoContactReconciliation as assess } from "./brevo-contact-reconciliation";
const tenantId="11111111-1111-4111-8111-111111111111",personId="22222222-2222-4222-8222-222222222222",id="33333333-3333-4333-8333-333333333333";
function fixture() {
 const person={tenantId,personId,email:"test@example.test",contactAllowed:true,doNotContact:false};
 const attempt={id,tenantId,personId,status:"write_outcome_unknown"};
 const contact={id:12,ext_id:`atlas:${tenantId}:${personId}`,email:person.email,emailBlacklisted:false,smsBlacklisted:false};
 const options={enabled:true,accountTenantId:tenantId,readAttempt:vi.fn(async()=>({...attempt})),readPerson:vi.fn(async()=>({...person})),observeContact:vi.fn(async()=>({kind:"found" as const,contact}))};
 return {person,attempt,contact,options};
}
describe("read-only contact reconciliation",()=>{
 it("is disabled by default",async()=>{const {options}=fixture();expect((await assess(id,{...options,enabled:undefined})).status).toBe('disabled');expect(options.readAttempt).not.toHaveBeenCalled();});
 it("rejects malformed identity",async()=>{const {options}=fixture();expect((await assess('bad',options)).status).toBe('invalid_identity');});
 it("rejects another tenant before provider access",async()=>{const {options,attempt}=fixture();attempt.tenantId=id;expect((await assess(id,options)).status).toBe('unauthorized_attempt');expect(options.observeContact).not.toHaveBeenCalled();});
 it("ignores completed attempts",async()=>{const {options,attempt}=fixture();attempt.status='created';expect((await assess(id,options)).status).toBe('attempt_already_final');});
 it.each(['absent','unknown'] as const)("never retries on %s",async kind=>{const {options}=fixture();expect(await assess(id,{...options,observeContact:async()=>({kind})})).toEqual({status:'outcome_unresolved',retryAllowed:false});});
 it("observes a linked contact without clearing the lock",async()=>{const {options}=fixture();expect(await assess(id,options)).toEqual({status:'linked_contact_observed_review_required',retryAllowed:false});});
 it("rejects contradictory provider identity",async()=>{const {options,contact}=fixture();contact.ext_id='foreign';expect((await assess(id,options)).status).toBe('identity_or_state_unverified');});
 it("detects changed permission during lookup",async()=>{const {options,person}=fixture();options.observeContact.mockImplementation(async()=>{person.doNotContact=true;return {kind:'found',contact:fixture().contact};});expect((await assess(id,options)).status).toBe('source_changed');});
 it("detects journal completion during lookup",async()=>{const {options,attempt}=fixture();options.observeContact.mockImplementation(async()=>{attempt.status='created';return {kind:'found',contact:fixture().contact};});expect((await assess(id,options)).status).toBe('source_changed');});
 it("requires suppression after opposition",async()=>{const {options,person}=fixture();person.doNotContact=true;expect((await assess(id,options)).status).toBe('suppression_required');});
 it("records observed suppression without unblocking",async()=>{const {options,person,contact}=fixture();person.contactAllowed=false;contact.emailBlacklisted=true;contact.smsBlacklisted=true;expect((await assess(id,options)).status).toBe('suppression_observed_review_required');});
 it("does not adopt a changed email",async()=>{const {options,contact}=fixture();contact.email='other@example.test';expect((await assess(id,options)).status).toBe('email_change_requires_review');});
 it("redacts unexpected errors",async()=>{const {options}=fixture();options.readAttempt.mockRejectedValue(new Error('secret'));expect(await assess(id,options)).toEqual({status:'verification_failed',retryAllowed:false});});
});
