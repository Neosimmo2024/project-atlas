import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const {context,manage,preview,execute}=vi.hoisted(()=>({context:vi.fn(),manage:vi.fn(),preview:vi.fn(),execute:vi.fn()}));
vi.mock("@/repositories/tenant-context",()=>({getTenantContext:context}));
vi.mock("@/services/ovh-connection",()=>({canManageOvh:manage}));
vi.mock("@/services/vsc-brevo-contact-import",()=>({previewVscBrevoContactImport:preview,executeVscBrevoContactImport:execute,VscBrevoImportInputError:class extends Error{}}));
import {GET,POST} from "@/app/api/admin/vsc-brevo-contacts/route";
const tenant="20000000-0000-0000-0000-000000000001",actor="10000000-0000-0000-0000-000000000001";
const request=(body=JSON.stringify({reviewKey:"a".repeat(64)}),origin="https://fixture.invalid",type="application/json")=>new Request("https://fixture.invalid/api/admin/vsc-brevo-contacts",{method:"POST",headers:{origin,"content-type":type},body});
describe("VSC import route authorization",()=>{
  beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("VSC_OVH_TENANT_ID",tenant);context.mockResolvedValue({tenantId:tenant,userId:actor});manage.mockReturnValue(true);preview.mockResolvedValue({sendingEnabled:false});execute.mockResolvedValue({created:1,sendingEnabled:false});});
  afterEach(()=>vi.unstubAllEnvs());
  it("requires VSC owner/admin session for reading and writing",async()=>{context.mockResolvedValueOnce(null);expect((await GET()).status).toBe(403);manage.mockReturnValue(false);expect((await POST(request())).status).toBe(403);vi.stubEnv("VSC_OVH_TENANT_ID","");expect((await GET()).status).toBe(403);expect(preview).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();});
  it("rejects cross-origin, bad JSON, oversized and non-JSON requests",async()=>{expect((await POST(request(undefined,"https://other.invalid"))).status).toBe(403);expect((await POST(request("{"))).status).toBe(400);expect((await POST(request("x".repeat(2001)))).status).toBe(413);expect((await POST(request("{}",undefined,"text/plain"))).status).toBe(415);expect(execute).not.toHaveBeenCalled();});
  it("ignores caller identities and contact payloads, uses server session with no cache",async()=>{const response=await POST(request(JSON.stringify({reviewKey:"a".repeat(64),tenantId:"foreign",actorId:"foreign",contacts:[{email:"untrusted"}]})));expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");expect(execute).toHaveBeenCalledExactlyOnceWith(tenant,actor,"a".repeat(64));expect(context).toHaveBeenCalledWith(tenant);});
  it("masks source and database errors without retry",async()=>{execute.mockRejectedValue(new Error("private coordinates"));const response=await POST(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private");expect(execute).toHaveBeenCalledTimes(1);});
});
