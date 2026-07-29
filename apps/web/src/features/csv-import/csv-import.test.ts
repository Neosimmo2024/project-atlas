import { describe, expect, it } from "vitest";
import { CSV_IMPORT_MAX_ROWS, previewCsvImport, type CsvImportAtlasData } from "./csv-import";

const tenantId = "tenant-a";
const otherTenantId = "tenant-b";

function atlas(overrides: Partial<CsvImportAtlasData> = {}): CsvImportAtlasData {
  return {
    people: [],
    organizations: [
      { id: "org-1", tenant_id: tenantId, name: "Neos Immo", status: "active" }
    ],
    owners: [
      { userId: "owner-1", label: "Renato Ponzio", email: "renato@example.test" }
    ],
    ...overrides
  };
}

describe("csv import preview", () => {
  it("parses comma CSV and proposes a mapping from French headers", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Email,Ville\nAda,Lovelace, ADA@EXAMPLE.TEST ,Paris"
    }, atlas(), { tenantId });

    expect(result.proposedMapping).toMatchObject({
      Prénom: "first_name",
      Nom: "last_name",
      Email: "email",
      Ville: "city"
    });
    expect(result.rows[0].normalizedValues.email).toBe("ada@example.test");
    expect(result.rows[0].classification).toBe("new_contact");
  });

  it("parses semicolon CSV with BOM, quoted separators and multiline fields", () => {
    const result = previewCsvImport({
      content: "\uFEFFPrénom;Nom;Commentaire\n\"Jean; Pierre\";Martin;\"ligne 1\nligne 2\""
    }, atlas(), { tenantId });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].normalizedValues.first_name).toBe("Jean; Pierre");
    expect(result.rows[0].normalizedValues.comments).toContain("ligne 2");
  });

  it("rejects empty files, duplicate headers and files over the row limit", () => {
    expect(() => previewCsvImport({ content: "" }, atlas(), { tenantId })).toThrow("vide");
    expect(() => previewCsvImport({ content: "Email,email\na@b.test,b@c.test" }, atlas(), { tenantId })).toThrow("duplique");

    const rows = Array.from({ length: CSV_IMPORT_MAX_ROWS + 1 }, (_, index) => `A${index},B${index}`).join("\n");
    expect(() => previewCsvImport({ content: `Prénom,Nom\n${rows}` }, atlas(), { tenantId })).toThrow("10 000");
  });

  it("prevents two CSV columns from feeding the same Atlas field", () => {
    expect(() => previewCsvImport({
      content: "Email,Mail\none@example.test,two@example.test",
      mapping: { Email: "email", Mail: "email" }
    }, atlas(), { tenantId })).toThrow("alimentent toutes les deux");
  });

  it("normalizes French phones so 06 and +336 match the same duplicate", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Téléphone\nAlice,Durand,+33 6 01 02 03 04"
    }, atlas({
      people: [{
        id: "person-1",
        tenant_id: tenantId,
        first_name: "Alice",
        last_name: "Durand",
        display_name: "Alice Durand",
        primary_email: null,
        primary_phone: "06.01.02.03.04",
        city: "Lyon",
        postal_code: null,
        source: null,
        comments: null,
        do_not_contact: false
      }]
    }), { tenantId });

    expect(result.rows[0].normalizedValues.phone).toBe("0601020304");
    expect(result.rows[0].classification).toBe("certain_duplicate");
    expect(result.rows[0].duplicatePersonIds).toEqual(["person-1"]);
  });

  it("detects possible duplicates by first name, last name and city without case or accents", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Ville\nAndre,DUPONT,Lyon"
    }, atlas({
      people: [{
        id: "person-2",
        tenant_id: tenantId,
        first_name: "André",
        last_name: "Dupont",
        display_name: "André Dupont",
        primary_email: null,
        primary_phone: null,
        city: "lyon",
        postal_code: null,
        source: null,
        comments: null,
        do_not_contact: false
      }]
    }), { tenantId });

    expect(result.rows[0].classification).toBe("possible_duplicate");
    expect(result.rows[0].possibleDuplicatePersonIds).toEqual(["person-2"]);
  });

  it("detects internal CSV duplicates before Atlas enrichment", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Email,Ville\nA,A,a@example.test,Nice\nB,B,a@example.test,Lyon\nC,C,,Paris\nC,C,,Paris"
    }, atlas(), { tenantId });

    expect(result.rows[0].classification).toBe("certain_duplicate");
    expect(result.rows[1].classification).toBe("certain_duplicate");
    expect(result.rows[2].classification).toBe("possible_duplicate");
    expect(result.rows[3].classification).toBe("possible_duplicate");
  });

  it("flags a critical conflict when email and phone match two different Atlas people", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Email,Téléphone\nA,A,email@example.test,0601020304"
    }, atlas({
      people: [
        {
          id: "email-person",
          tenant_id: tenantId,
          first_name: "Email",
          last_name: "Person",
          display_name: "Email Person",
          primary_email: "email@example.test",
          primary_phone: null,
          city: null,
          postal_code: null,
          source: null,
          comments: null,
          do_not_contact: false
        },
        {
          id: "phone-person",
          tenant_id: tenantId,
          first_name: "Phone",
          last_name: "Person",
          display_name: "Phone Person",
          primary_email: null,
          primary_phone: "0601020304",
          city: null,
          postal_code: null,
          source: null,
          comments: null,
          do_not_contact: false
        }
      ]
    }), { tenantId });

    expect(result.rows[0].classification).toBe("critical_conflict");
  });

  it("proposes enrichment only for empty Atlas fields and preserves do not contact", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Email,Ville,Source,Commentaire\nAda,Lovelace,ada@example.test,Paris,Salon,Note import"
    }, atlas({
      people: [{
        id: "person-3",
        tenant_id: tenantId,
        first_name: "Ada",
        last_name: "Lovelace",
        display_name: "Ada Lovelace",
        primary_email: "ada@example.test",
        primary_phone: null,
        city: "Lyon",
        postal_code: null,
        source: null,
        comments: "Deja renseigne",
        do_not_contact: true
      }]
    }), { tenantId });

    expect(result.rows[0].classification).toBe("existing_contact_enrichment");
    expect(result.rows[0].fieldsToEnrich).toEqual({ source: "Salon" });
    expect(result.rows[0].fieldConflicts.city).toEqual({ existing: "Lyon", incoming: "Paris" });
    expect(result.rows[0].fieldConflicts.comments).toEqual({ existing: "Deja renseigne", incoming: "Note import" });
    expect(result.rows[0].warnings).toContain("Le contact existant est marque Ne plus contacter et ne doit pas etre reactive automatiquement.");
  });

  it("warns for unknown owner, organization, network and VAT values without creating references", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Organisation,Réseau immobilier,Propriétaire du contact,Statut TVA\nA,A,Unknown Org,Unknown Network,Unknown Owner,peut-etre"
    }, atlas(), { tenantId });

    expect(result.rows[0].warnings).toEqual(expect.arrayContaining([
      "Organisation inconnue dans le tenant: Unknown Org",
      "Reseau immobilier inconnu dans le tenant: Unknown Network",
      "Proprietaire du contact inconnu dans le tenant: Unknown Owner",
      "Statut TVA non reconnu: peut-etre"
    ]));
  });

  it("rejects unknown pipeline stages", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Phase de recrutement\nA,A,Phase magique"
    }, atlas(), { tenantId });

    expect(result.rows[0].classification).toBe("rejected_row");
    expect(result.rows[0].errors).toContain("Phase de recrutement inconnue: Phase magique");
  });

  it("refuses comparison data from another tenant", () => {
    expect(() => previewCsvImport({
      content: "Prénom,Nom,Email\nA,A,a@example.test"
    }, atlas({
      people: [{
        id: "foreign",
        tenant_id: otherTenantId,
        first_name: "A",
        last_name: "A",
        display_name: "A A",
        primary_email: "a@example.test",
        primary_phone: null,
        city: null,
        postal_code: null,
        source: null,
        comments: null,
        do_not_contact: false
      }]
    }), { tenantId })).toThrow("tenant actif");
  });

  it("returns a stable summary and performs no business write during preview", () => {
    const result = previewCsvImport({
      content: "Prénom,Nom,Email,Ville\nA,A,a@example.test,Paris\nB,B,b@example.test,Lyon"
    }, atlas(), { tenantId });

    expect(result.summary).toEqual({
      totalRows: 2,
      newContacts: 2,
      existingContactsToEnrich: 0,
      certainDuplicates: 0,
      possibleDuplicates: 0,
      criticalConflicts: 0,
      rejectedRows: 0
    });
    expect(result.rows.every((row) => row.existingPersonId === null)).toBe(true);
  });
});
