import { describe, it, expect, vi } from "vitest";
import { createBrevoContactObserver } from "./brevo-contact-observer";
const tenant="11111111-1111-4111-8111-111111111111", ext=`atlas:${tenant}:22222222-2222-4222-8222-222222222222`;
const contact={id:12,email:'test@example.test',emailBlacklisted:false,smsBlacklisted:true};
function setup(status=200,body:unknown=contact){const transport=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body),{status}));return {transport,options:{enabled:true,accountTenantId:tenant,apiKey:'mock-secret',transport}};}
describe('read-only Brevo observer',()=>{
 it('sends only a typed GET to the fixed origin',async()=>{const {options,transport}=setup();expect(await createBrevoContactObserver(options)(ext)).toEqual({kind:'found',contact:{...contact,ext_id:ext}});expect(transport).toHaveBeenCalledTimes(1);expect(transport.mock.calls[0][0]).toBe(`https://api.brevo.com/v3/contacts/${encodeURIComponent(ext)}?identifierType=ext_id`);expect(transport.mock.calls[0][1]).toMatchObject({method:'GET',redirect:'error',cache:'no-store'});});
 it('is disabled by default',async()=>{const {options,transport}=setup();expect(await createBrevoContactObserver({...options,enabled:undefined})(ext)).toEqual({kind:'unknown'});expect(transport).not.toHaveBeenCalled();});
 it.each(['https://evil.test',ext.replace(tenant,'33333333-3333-4333-8333-333333333333')])('rejects invalid identity %s',async id=>{const {options,transport}=setup();await createBrevoContactObserver(options)(id);expect(transport).not.toHaveBeenCalled();});
 it('requires a key',async()=>{const {options,transport}=setup();await createBrevoContactObserver({...options,apiKey:''})(ext);expect(transport).not.toHaveBeenCalled();});
 it('recognizes only a precise missing-contact response',async()=>{const {options}=setup(404,{code:'document_not_found'});expect(await createBrevoContactObserver(options)(ext)).toEqual({kind:'absent'});});
 it.each([[404,{}],[401,{}],[429,{}],[500,{}],[200,{...contact,ext_id:'foreign'}],[200,{...contact,id:-1}],[200,{...contact,smsBlacklisted:undefined}],[200,[]]])('fails closed on response %j',async(status,body)=>{const {options}=setup(status as number,body);expect(await createBrevoContactObserver(options)(ext)).toEqual({kind:'unknown'});});
 it('redacts transport errors',async()=>{const {options,transport}=setup();transport.mockRejectedValue(new Error('private'));expect(await createBrevoContactObserver(options)(ext)).toEqual({kind:'unknown'});});
 it('rejects malformed JSON',async()=>{const {options,transport}=setup();transport.mockResolvedValue(new Response('bad'));expect(await createBrevoContactObserver(options)(ext)).toEqual({kind:'unknown'});});
});
