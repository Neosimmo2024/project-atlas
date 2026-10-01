import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), load: vi.fn(), completed: vi.fn(), excluded: vi.fn(), preview: vi.fn(), execute: vi.fn() }));
vi.mock("@/repositories/tenant-context", () => ({ getTenantContext: mocks.context }));
vi.mock("@/repositories/prospect-integration", () => ({ loadProspectImport: mocks.load, findCompletedProspectImport: mocks.completed, assertProspectMatchesContactable: mocks.excluded }));
vi.mock("@/repositories/csv-import-preview", () => ({ previewTenantCsvImport: mocks.preview }));
vi.mock("@/repositories/csv-import-execution", () => ({ executeTenantCsvImport: mocks.execute }));
import { POST } from "./route";
import { ApiError } from "@/lib/api-errors";
const source = { listId: "11111111-1111-4111-8111-111111111111", siret: "12345678900012", reviewedAt: "2026-10-01T07:00:00Z" };
const body = { source, analysisFingerprint: "fingerprint", decisions: [{ lineNumber: 2, decision: "create_new" }], addToPipeline: true, confirm: true, personConfirmed: true };
const request = (change = {}) => new Request("https://atlas.test/api/prospects/integrate", { method: "POST", body: JSON.stringify({ ...body, ...change }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ tenantId: "real", userId: "owner", role: "owner" });
  mocks.load.mockResolvedValue({ source, content: "server-only", mapping: {}, idempotencyKey: "server-key", fileName: "verified" });
  mocks.completed.mockResolvedValue(null); mocks.excluded.mockResolvedValue(undefined);
  mocks.preview.mockResolvedValue({ rows: [] }); mocks.execute.mockResolvedValue({ id: "report" });
});
it("requires authentication and a writing role", async () => {
  mocks.context.mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(401);
  mocks.context.mockResolvedValueOnce({ role: "reader" });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("requires explicit integration and person confirmation", async () => {
  expect((await POST(request({ confirm: false }))).status).toBe(400);
  expect((await POST(request({ personConfirmed: false }))).status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("ignores client contact data, tenant and idempotency key", async () => {
  expect((await POST(request({ content: "forged", tenant_id: "foreign", idempotencyKey: "forged" }))).status).toBe(200);
  expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "real" }), expect.objectContaining({ content: "server-only" }));
  expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "real" }), expect.objectContaining({ idempotencyKey: "server-key" }));
});
it("rejects a stale or no longer eligible review", async () => {
  expect((await POST(request({ source: { ...source, reviewedAt: "older" } }))).status).toBe(409);
  mocks.load.mockRejectedValue(new ApiError("Not ready", 400, "PROSPECT_NOT_READY"));
  expect((await POST(request())).status).toBe(400);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("blocks excluded matches before any write", async () => {
  mocks.excluded.mockRejectedValue(new ApiError("Excluded", 409, "PROSPECT_EXCLUDED"));
  expect((await POST(request())).status).toBe(409);
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("returns the existing report on retry without re-executing", async () => {
  mocks.completed.mockResolvedValue({ id: "old-report", idempotent: true });
  const result = await POST(request());
  expect(await result.json()).toEqual({ data: { id: "old-report", idempotent: true } });
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.preview).not.toHaveBeenCalled();
});
