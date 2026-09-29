import { describe, expect, it } from "vitest";
import { atlasDateTimeInputToIso, formatAtlasDate, toAtlasDateTimeInput } from "./date-time";

describe("Paris task dates", () => {
  it.each([
    ["2026-09-25T16:22:00Z", "2026-09-25T18:22", "18:22"],
    ["2026-01-25T16:22:00Z", "2026-01-25T17:22", "17:22"],
    ["2026-09-25T22:30:00Z", "2026-09-26T00:30", "00:30"],
    ["2026-03-29T00:30:00Z", "2026-03-29T01:30", "01:30"],
    ["2026-03-29T01:30:00Z", "2026-03-29T03:30", "03:30"]
  ])("round-trips %s without relying on the runtime timezone", (instant, input, time) => {
    expect(toAtlasDateTimeInput(instant)).toBe(input);
    expect(formatAtlasDate(instant)).toContain(time);
    expect(atlasDateTimeInputToIso(input)).toBe(new Date(instant).toISOString());
  });

  it.each(["2026-10-25T00:30:42.123Z", "2026-10-25T01:30:42.123Z", "2026-09-25T16:22:59.123456+00:00"])(
    "preserves the exact original instant when only another field is edited: %s", (instant) => {
      expect(atlasDateTimeInputToIso(toAtlasDateTimeInput(instant), instant)).toBe(instant);
    }
  );

  it("converts a changed deadline instead of retaining the previous instant", () => {
    expect(atlasDateTimeInputToIso("2026-09-25T19:22", "2026-09-25T16:22:42Z")).toBe("2026-09-25T17:22:00.000Z");
  });

  it("allows clearing an existing deadline", () => {
    expect(atlasDateTimeInputToIso("", "2026-09-25T16:22:42Z")).toBe("");
  });

  it("rejects a nonexistent spring wall-clock time", () => {
    expect(() => atlasDateTimeInputToIso("2026-03-29T02:30")).toThrow("n’existe pas");
  });

  it("rejects a new ambiguous autumn time instead of silently choosing an occurrence", () => {
    expect(() => atlasDateTimeInputToIso("2026-10-25T02:30")).toThrow("deux fois");
  });

  it.each(["invalid", "2026-02-30T12:00", "2026-09-25T25:22", "2026-09-25T18:22Z"])(
    "rejects malformed or impossible input %s", (value) => {
      expect(() => atlasDateTimeInputToIso(value)).toThrow("date est invalide");
    }
  );

  it("handles absent or invalid stored values for display", () => {
    expect(toAtlasDateTimeInput(null)).toBe("");
    expect(toAtlasDateTimeInput("invalid")).toBe("");
    expect(formatAtlasDate(null)).toBeNull();
    expect(formatAtlasDate("invalid")).toBeNull();
  });
});
