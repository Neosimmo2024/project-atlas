import { describe, expect, it } from "vitest";
import { localFollowUpAt } from "./local-campaign";
describe("Saint-Maur calendar in Paris", () => {
  it.each([
    ["2026-10-17T07:30:00Z",10,"2026-10-27T08:30:00.000Z"],
    ["2026-10-17T07:30:00Z",20,"2026-11-06T08:30:00.000Z"],
    ["2026-10-19T07:30:00Z",20,"2026-11-09T08:30:00.000Z"],
    ["2026-10-22T07:30:00Z",10,"2026-11-02T08:30:00.000Z"],
    ["2026-10-23T07:45:00Z",10,"2026-11-02T08:30:00.000Z"],
    ["2027-03-20T08:30:00Z",10,"2027-03-30T07:30:00.000Z"]
  ])("uses the actual initial date, changes offset and skips Sunday", (sent, days, due) => {
    expect(localFollowUpAt(sent,days)).toBe(due);
  });
});
