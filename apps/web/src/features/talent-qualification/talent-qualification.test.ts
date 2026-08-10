import { describe, expect, it } from "vitest";
import { parseTalentQualification } from "./validation";

const base = {
  experience_level: "Confirmé",
  professional_status: "Mandataire indépendant",
  years_in_real_estate: "6",
  vat_situation: "Assujetti",
  current_network: "Réseau actuel",
  geographic_area: "Val-de-Marne",
  availability: "Sous 3 mois",
  motivation: "Développer son activité",
  primary_need: "Accompagnement",
  project_maturity: "Décision en cours",
  comments: "Échange constructif",
  conclusion: "",
  action: "draft"
};

describe("talent qualification validation", () => {
  it("accepts an incomplete draft and normalizes nullable values", () => {
    const result = parseTalentQualification(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.years_in_real_estate).toBe(6);
      expect(result.data.conclusion).toBeNull();
    }
  });

  it("requires an explicit conclusion to finalize", () => {
    const result = parseTalentQualification({ ...base, action: "finalize" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["conclusion"]);
  });

  it("accepts each deliberate conclusion without calculating a score", () => {
    for (const conclusion of ["continue", "deepen", "not_retained"]) {
      const result = parseTalentQualification({ ...base, action: "finalize", conclusion });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data).not.toHaveProperty("score");
    }
  });

  it("rejects invalid real-estate experience bounds", () => {
    expect(parseTalentQualification({ ...base, years_in_real_estate: "81" }).success).toBe(false);
  });
});
