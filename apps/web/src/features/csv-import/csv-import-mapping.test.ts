import { describe, expect, it } from "vitest";
import { CSV_IMPORT_FIELD_DEFINITIONS, CSV_IMPORT_FIELD_GROUP_LABELS, validateCsvImportMapping } from "./csv-import-mapping";

describe("csv import column mapping", () => {
  it("keeps visible CSV mapping labels encoded as UTF-8 French text", () => {
    const visibleText = [
      ...Object.values(CSV_IMPORT_FIELD_GROUP_LABELS),
      ...CSV_IMPORT_FIELD_DEFINITIONS.map((definition) => definition.label)
    ].join(" ");

    expect(visibleText).toContain("Prénom");
    expect(visibleText).toContain("Téléphone");
    expect(visibleText).toContain("Statut TVA");
    expect(visibleText).not.toMatch(/Ã|Â|â€™|â€“/);
  });

  it("accepts an identity, a usable contact and ignored columns", () => {
    expect(validateCsvImportMapping(
      ["Prénom", "Email", "Ancien identifiant"],
      { Prénom: "first_name", Email: "email", "Ancien identifiant": "ignore" }
    )).toEqual({ valid: true, errors: [] });
  });

  it("requires a person identity", () => {
    const result = validateCsvImportMapping(["Email"], { Email: "email" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Associez au moins un prénom ou un nom pour identifier la personne.");
  });

  it("requires a usable contact channel", () => {
    const result = validateCsvImportMapping(["Nom", "Ville"], { Nom: "last_name", Ville: "city" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Associez au moins un e-mail ou un téléphone exploitable.");
  });

  it("rejects duplicate Atlas destinations", () => {
    const result = validateCsvImportMapping(
      ["Prénom", "Nom", "Email", "E-mail secondaire"],
      { Prénom: "first_name", Nom: "last_name", Email: "email", "E-mail secondaire": "email" }
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Les colonnes « Email » et « E-mail secondaire » utilisent le même champ Atlas.");
  });

  it("requires an explicit decision for every source column", () => {
    const result = validateCsvImportMapping(["Prénom", "Email", "Source"], { Prénom: "first_name", Email: "email" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Choisissez une correspondance pour la colonne « Source » ou ignorez-la.");
  });
});
