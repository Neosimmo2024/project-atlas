import { describe, expect, it } from "vitest";
import { normalizeVscImportPhone as phone, normalizeVscImportEmail as email, normalizeVscBrevoContact as normalize, groupVscBrevoContacts as group, summarizeVscBrevoGroups as summary, isVscFrenchMobile } from "./brevo-contact-import";
describe("VSC Brevo source reconciliation", () => {
  it("keeps landlines as coordinates, not SMS mobiles", () => {
    for (const value of [33988460814, "09 88 46 08 14", "+33 (9) 88.46.08.14", "0033988460814"]) expect(phone(value)).toBe("+33988460814");
    expect(isVscFrenchMobile(phone("0612345678"))).toBe(true);
    expect(isVscFrenchMobile(phone(33988460814))).toBe(false);
    expect(isVscFrenchMobile(phone("+32612345678"))).toBe(false);
    for (const value of ["+33(0)612345678", "+3361234567", "06123456789", "0612345678 ext 2", "0612345678/0712345678", {}, null]) expect(phone(value)).toBeNull();
  });
  it("excludes synthetic SMS identifiers and malformed real emails", () => {
    expect(email(" SHOP@EXAMPLE.COM ")).toBe("shop@example.com");
    for (const value of ["33612345678@mailin-sms.com", "33988460814@landline.mailin-sms.com", "x@other.mailin-sms.com", ".shop@example.com", "a..b@example.com", "a@-example.com", "a@example.c", "a@example.com\nBcc:b@c.com", "a@b", null]) expect(email(value)).toBeNull();
  });
  it("recovers a verified Brevo landline identifier as a phone, never an email or SMS mobile", () => {
    const row=normalize({id:1,email:"33988460814@landline.mailin-sms.com",emailBlacklisted:true,smsBlacklisted:false});
    expect(row).toMatchObject({email:null,phone:"+33988460814",phone_source:"brevo_sms_identifier",provider_sms_identifier:"33988460814@landline.mailin-sms.com"});
    expect(isVscFrenchMobile(row.phone)).toBe(false);
    expect(normalize({id:2,email:"33988460814@unrelated.example.com"}).phone).toBeNull();
    expect(normalize({id:3,email:"invalid@landline.mailin-sms.com"})).toMatchObject({email:null,phone:null});
    expect(()=>normalize({id:4,email:"33988460814@landline.mailin-sms.com",attributes:{SMS:"0612345678"}})).toThrow("contradictoires");
  });
  it("preserves business provenance and defaults unknown permissions to blocked", () => {
    const row = normalize({ id: 1, attributes: { COMPANY_NAME: "Commerce", SMS: 33988460814, ADDRESS: "Adresse source", SOURCE_URL: "https://example.com", CODE_POSTAL: "94170", NE_PAS_CONTACTER: 1 }, listIds: [4,4,2,-1] });
    expect(row).toMatchObject({ display_name: "Commerce", phone: "+33988460814", email: null, department: "94", email_blocked: true, sms_blocked: true, email_status_known: false, do_not_contact: true, source_lists: [2,4] });
    expect(row.comments).toContain("Adresse source");
    expect(() => normalize({id: NaN})).toThrow();
  });
  it("deduplicates aliases, ORs exclusions, and retains each original source status", () => {
    const rows = [normalize({id:2,email:"same@example.com",emailBlacklisted:true,smsBlacklisted:false}), normalize({id:1,email:"SAME@example.com",emailBlacklisted:false,smsBlacklisted:false,attributes:{SMS:"0612345678",COMPANY_NAME:"Shop"}})];
    const result = group(rows, String);
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({person_id:"1",source_ids:[1,2],conflict:false,email_blocked:true,phone:"+33612345678"});
    expect(result[0].source_records.map(r=>r.email_blocked)).toEqual([false,true]);
    expect(summary(rows,result)).toMatchObject({duplicateRecords:1,emailCandidates:0,smsCandidates:1});
  });
  it("stages transitive contradictory identities without silently merging people", () => {
    const rows = [normalize({id:1,email:"a@example.com",attributes:{SMS:"0612345678"}}),normalize({id:2,email:"a@example.com",attributes:{SMS:"0712345678"}}),normalize({id:3,email:"b@example.com",attributes:{SMS:"0712345678"}}),normalize({id:4}),normalize({id:5})];
    const result=group(rows,String);
    expect(result).toHaveLength(3); expect(result[0]).toMatchObject({source_ids:[1,2,3],conflict:true,email:null,phone:null});
    expect(summary(rows,result)).toMatchObject({sourceConflicts:1,withoutCoordinates:2,emailCandidates:0,smsCandidates:0});
  });
});
