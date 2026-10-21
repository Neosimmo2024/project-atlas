import { describe, expect, it } from "vitest";
import { safePersonReturnTo } from "./person-detail-return";

const relationshipPath = "/relationships/4eb0fb47-9bea-4222-b5b5-a3896f9baa3b";
const organizationPath = "/organizations/5658f19f-8941-4bfb-8dbd-ec710065e2a4";

describe("safePersonReturnTo", () => {
  it("returns to the originating project and drops extra navigation parameters", () => {
    const projectPath = "/projects/1dddc08d-deaf-4da7-8129-7bdecf48ec16";
    expect(safePersonReturnTo(projectPath)).toBe(projectPath);
    expect(safePersonReturnTo(`${projectPath}?returnTo=https://example.com`)).toBe(projectPath);
    expect(safePersonReturnTo(`https://example.com${projectPath}`)).toBe("/people");
    expect(safePersonReturnTo("/projects/not-a-uuid")).toBe("/people");
  });

  it("keeps a valid relationship return path", () => {
    expect(safePersonReturnTo(relationshipPath)).toBe(relationshipPath);
  });

  it("keeps the originating pipeline path through the relationship", () => {
    const returnTo = `${relationshipPath}?returnTo=${encodeURIComponent("/pipeline?stage=conversation&view=kanban")}`;
    expect(safePersonReturnTo(returnTo))
      .toBe(`${relationshipPath}?returnTo=${encodeURIComponent("/pipeline?stage=conversation&view=kanban")}`);
  });

  it("keeps an Organization return path and its safe Relationship context", () => {
    expect(safePersonReturnTo(organizationPath)).toBe(organizationPath);

    const returnTo = `${organizationPath}?returnTo=${encodeURIComponent(relationshipPath)}`;
    expect(safePersonReturnTo(returnTo)).toBe(returnTo);
  });

  it("drops an unsafe nested return while preserving the relationship", () => {
    const returnTo = `${relationshipPath}?returnTo=${encodeURIComponent("https://example.com/pipeline")}`;
    expect(safePersonReturnTo(returnTo)).toBe(relationshipPath);
  });

  it("falls back to people for unsafe or unrelated paths", () => {
    expect(safePersonReturnTo("")).toBe("/people");
    expect(safePersonReturnTo(`https://example.com${relationshipPath}`)).toBe("/people");
    expect(safePersonReturnTo("/people")).toBe("/people");
    expect(safePersonReturnTo("/relationships/not-a-uuid")).toBe("/people");
    expect(safePersonReturnTo("/organizations/not-a-uuid")).toBe("/people");
  });
});
