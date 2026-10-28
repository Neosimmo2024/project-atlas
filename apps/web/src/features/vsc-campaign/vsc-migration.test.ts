import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261028090000_vsc_campaign_drafts.sql"), "utf8");

describe("VSC campaign migration safety", () => {
  it("enables RLS on campaigns and deliveries", () => {
    expect(sql).toContain("alter table public.vsc_campaigns enable row level security");
    expect(sql).toContain("alter table public.vsc_campaign_deliveries enable row level security");
  });
  it("enforces tenant integrity across campaign and person foreign keys", () => {
    expect(sql).toContain("foreign key (tenant_id,campaign_id)");
    expect(sql).toContain("foreign key (tenant_id,person_id)");
  });
  it("does not grant direct sending or editing permissions to authenticated clients", () => {
    expect(sql).toContain("revoke all on public.vsc_campaigns, public.vsc_campaign_deliveries from anon, authenticated");
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on public\.vsc_/i);
  });
});
