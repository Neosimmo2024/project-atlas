import { describe, expect, it } from "vitest";
import { safeTaskReturnTo } from "./task-detail-return";

describe("task detail return target", () => {
  it("accepts the Action Plan organization context", () => {
    expect(safeTaskReturnTo("/action-plan?organizationId=organization-1")).toBe("/action-plan?organizationId=organization-1");
  });

  it("falls back to the Tasks list without a contextual return target", () => {
    expect(safeTaskReturnTo("")).toBe("/tasks");
  });

  it("rejects external or unauthorized return targets", () => {
    expect(safeTaskReturnTo("https://example.com/action-plan?organizationId=organization-1")).toBe("/tasks");
    expect(safeTaskReturnTo("/projects")).toBe("/tasks");
    expect(safeTaskReturnTo("/action-plan?organizationId=../bad")).toBe("/tasks");
  });
});
