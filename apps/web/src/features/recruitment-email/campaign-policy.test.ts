import { describe, expect, it } from "vitest";
import { LYON_CAMPAIGN_MARKER, recruitmentEmailPolicy } from "./campaign-policy";

describe("campaign isolation", () => {
  it("keeps Lyon a draft with 17/32-day delays, including profiles in another city", () => {
    expect(recruitmentEmailPolicy(`Bron ${LYON_CAMPAIGN_MARKER}`)).toMatchObject({
      days: [0, 17, 32], sendingEnabled: false, key: "lyon-development"
    });
  });
  it.each([null, undefined, "", "Agence située à Lyon, campagne nationale"])("does not infer a campaign from geography: %s", (comments) => {
    expect(recruitmentEmailPolicy(comments)).toMatchObject({
      days: [0, 3, 7], sendingEnabled: true, key: "national-recruitment"
    });
  });
});
