import { describe, expect, it } from "vitest";
import { safePersonReturnTo } from "./person-detail-return";

const relationshipPath = "/relationships/4eb0fb47-9bea-4222-b5b5-a3896f9baa3b";

describe("safePersonReturnTo", () => {
  it("keeps a valid relationship return path", () => {
    expect(safePersonReturnTo(relationshipPath)).toBe(relationshipPath);
  });

  it("keeps the originating pipeline path through the relationship", () => {
    const returnTo = `${relationshipPath}?returnTo=${encodeURIComponent("/pipeline?stage=conversation&view=kanban")}`;
    expect(safePersonReturnTo(returnTo))
      .toBe(`${relationshipPath}?returnTo=${encodeURIComponent("/pipeline?stage=conversation&view=kanban")}`);
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
  });
});
