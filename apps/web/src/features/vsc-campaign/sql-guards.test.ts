/**
 * Offline VSC campaign SQL guard tests.
 * These are structural checks only; actual PostgreSQL/RLS integration QA
 * must still run against a disposable local Supabase instance.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = (name: string) =>
  readFileSync(resolve(process.cwd(), "../../supabase/migrations/" + name), "utf8");
const drafts = migration("20261028090000_vsc_campaign_drafts.sql");
const replies = migration("20261028091000_vsc_inbound_reply_journal.sql");
const stop = migration("20261028092000_vsc_verified_reply_stop.sql");

describe("VSC SQL structural guardrails", () => {
  it("requires tenant-bound foreign keys for campaign deliveries", () => {
    expect(drafts).toContain("foreign key (tenant_id,campaign_id)");
    expect(drafts).toContain("foreign key (tenant_id,person_id)");
  });
  it("enables RLS for all VSC tables", () => {
    for (const [sql, table] of [
      [drafts, "vsc_campaigns"], [drafts, "vsc_campaign_deliveries"],
      [replies, "vsc_inbound_replies"]
    ]) expect(sql).toContain(`alter table public.${table} enable row level security`);
  });
  it("restricts reply stopping to pending messages in the same tenant", () => {
    expect(stop).toContain("where tenant_id = p_tenant_id");
    expect(stop).toContain("and person_id = p_person_id");
    expect(stop).toContain("status in ('draft', 'scheduled')");
    expect(stop).toContain("to service_role");
  });
});
