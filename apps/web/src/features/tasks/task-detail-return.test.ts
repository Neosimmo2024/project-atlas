import { describe, expect, it } from "vitest";
import { safeTaskReturnTo } from "./task-detail-return";

describe("task detail return target", () => {
  it("accepts the Action Plan organization context", () => {
    expect(safeTaskReturnTo("/action-plan?organizationId=organization-1")).toBe("/action-plan?organizationId=organization-1");
  });

  it("keeps a Person detail context, including its safe nested return target", () => {
    const relationship = "/relationships/4eb0fb47-9bea-4222-b5b5-a3896f9baa3b?returnTo=%2Fpipeline%3Fview%3Dkanban";
    const person = `/people/5658f19f-8941-4bfb-8dbd-ec710065e2a4?returnTo=${encodeURIComponent(relationship)}`;
    expect(safeTaskReturnTo(person)).toBe(person);
  });

  it("falls back to the Tasks list without a contextual return target", () => {
    expect(safeTaskReturnTo("")).toBe("/tasks");
  });

  it("rejects external or unauthorized return targets", () => {
    expect(safeTaskReturnTo("https://example.com/action-plan?organizationId=organization-1")).toBe("/tasks");
    expect(safeTaskReturnTo("/projects")).toBe("/tasks");
    expect(safeTaskReturnTo("/people/not-a-uuid")).toBe("/tasks");
    expect(safeTaskReturnTo("/action-plan?organizationId=../bad")).toBe("/tasks");
  });
});
