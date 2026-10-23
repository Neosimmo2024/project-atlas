import { describe, expect, it } from "vitest";
import { parisFollowUpAt, marketingSnapshotSchema } from "./marketing-follow-ups";
describe("marketing follow-up calendar", () => {
  it("keeps 12:15 Paris after the October clock change", () => {
    expect(parisFollowUpAt("2026-10-23T10:15:00Z", 15)).toBe("2026-11-07T11:15:00.000Z");
    expect(parisFollowUpAt("2026-10-23T10:15:00Z", 30)).toBe("2026-11-22T11:15:00.000Z");
  });
  it("keeps Sundays and supports Lyon's 09:30 slot", () => {
    expect(parisFollowUpAt("2026-10-24T10:15:00Z", 15)).toBe("2026-11-08T11:15:00.000Z");
    expect(parisFollowUpAt("2026-10-15T07:34:55.086Z", 15, 9, 30)).toBe("2026-10-30T08:30:00.000Z");
  });
  it("rejects an unrelated campaign and a changed cadence", () => {
    const base = { key: "bordeaux-marketing-20261023", project_id: "11111111-1111-4111-8111-111111111111", template_ids: [1,1,2], first_name: "", days: [0,15,30] };
    expect(marketingSnapshotSchema.safeParse(base).success).toBe(true);
    expect(marketingSnapshotSchema.safeParse({ ...base, key: "other" }).success).toBe(false);
    expect(marketingSnapshotSchema.safeParse({ ...base, days: [0,1,2] }).success).toBe(false);
  });
});
