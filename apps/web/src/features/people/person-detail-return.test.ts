import { describe, expect, it } from "vitest";
import { safePersonReturnTo } from "./person-detail-return";

describe("safePersonReturnTo", () => {
  it("keeps a valid relationship return path", () => {
    expect(safePersonReturnTo("/relationships/4eb0fb47-9bea-4222-b5b5-a3896f9baa3b"))
      .toBe("/relationships/4eb0fb47-9bea-4222-b5b5-a3896f9baa3b");
  });

  it("falls back to people for unsafe or unrelated paths", () => {
    expect(safePersonReturnTo("")).toBe("/people");
    expect(safePersonReturnTo("https://example.com/relationships/4eb0fb47-9bea-4222-b5b5-a3896f9baa3b")).toBe("/people");
    expect(safePersonReturnTo("/people")).toBe("/people");
    expect(safePersonReturnTo("/relationships/not-a-uuid")).toBe("/people");
  });
});
