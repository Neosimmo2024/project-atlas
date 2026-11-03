import { describe,it,expect } from "vitest";
import { eligibleLfiContact,escapeEmailHtml,validUnsubscribeToken } from "./lfi-campaign-policy";
const person={primary_email:"agent@example.com",postal_code:"94100",contact_allowed:true,do_not_contact:false,status:"qualified"};
describe("LFI exclusions",()=>{
 it("accepts an eligible IDF contact",()=>expect(eligibleLfiContact(person)).toBe(true));
 it.each([{postal_code:"69001"},{postal_code:null},{contact_allowed:false},{do_not_contact:true},{status:"archived"},{status:"rejected"},{primary_email:"bad\naddress"}])("rejects %j",override=>expect(eligibleLfiContact({...person,...override})).toBe(false));
 it("escapes user names and message content",()=>expect(escapeEmailHtml('<img src="x">&')).toBe('&lt;img src=&quot;x&quot;&gt;&amp;'));
 it("requires a full opaque random token",()=>{expect(validUnsubscribeToken('a'.repeat(64))).toBe(true);expect(validUnsubscribeToken('a'.repeat(63))).toBe(false);expect(validUnsubscribeToken('<script>')).toBe(false);});
});
