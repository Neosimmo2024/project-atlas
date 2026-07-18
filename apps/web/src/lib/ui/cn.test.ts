import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("foundation UI helpers", () => {
  it("composes class names predictably", () => {
    expect(cn("card", false, null, undefined, "stack")).toBe("card stack");
  });
});
