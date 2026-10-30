/**
 * VSC campaign validation for non-sending preview endpoints.
 * This intentionally exposes no database writes and no activation controls.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const api = readFileSync(resolve(process.cwd(),
  "src/app/api/admin/vsc-reply-preview/route.ts"), "utf8");
const summary = readFileSync(resolve(process.cwd(),
  "src/app/api/admin/vsc-campaign-summary/route.ts"), "utf8");

describe("VSC admin API security structure", () => {
  it("requires tenant context and OVH administrator access", () => {
    for (const route of [api, summary]) {
      expect(route).toContain("getTenantContext(tenantId)");
      expect(route).toContain("canManageOvh(context)");
    }
  });
  it("does not expose a send or activation handler", () => {
    expect(api).not.toContain("sendApprovedVscEmail");
    expect(summary).not.toContain("sendApprovedVscEmail");
    expect(api).not.toContain("reconcileVscRepliesOnce");
    expect(summary).not.toContain("reconcileVscRepliesOnce");
  });
});
