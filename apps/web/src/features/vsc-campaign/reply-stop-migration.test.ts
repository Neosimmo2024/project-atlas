import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261028092000_vsc_verified_reply_stop.sql"), "utf8");

describe("VSC verified reply stop migration", () => {
  it("limits invocation to the service role", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toMatch(/revoke all on function public\.vsc_record_verified_reply[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.vsc_record_verified_reply[\s\S]*to service_role/);
  });
  it("is idempotent and cancels only pending work", () => {
    expect(sql).toContain("on conflict (tenant_id, provider_message_id) do nothing");
    expect(sql).toContain("get diagnostics inserted_count = row_count");
    expect(sql).toContain("status in ('draft', 'scheduled')");
    expect(sql).not.toContain("status in ('draft', 'scheduled', 'claimed')");
  });
  it("scopes cancellation to the same tenant and prospect", () => {
    expect(sql).toContain("where tenant_id = p_tenant_id");
    expect(sql).toContain("and person_id = p_person_id");
  });
});
