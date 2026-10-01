import { expect, it } from "vitest";
import { buildProspectImport } from "./integration";
import { previewCsvImport } from "@/features/csv-import/csv-import";
import { validateCsvImportMapping } from "@/features/csv-import/csv-import-mapping";
const listId = "11111111-1111-4111-8111-111111111111";
const candidate = { siret: "12345678900012", name: 'Agence "Test", immobilier', city: "Saint-Maur", postalCode: "94100" };
const review = { status: "qualified", kind: "agence", first_name: "Alice", last_name: "Test", email: "alice@example.com", phone: "", source_url: "https://example.com", notes: "Texte\navec virgule, et citation \"ici\"", reviewed_at: "2026-10-01T07:00:00Z" };
it("prepares one exact person and organization without turning the company into a person", () => {
  const source = buildProspectImport(listId, candidate, review);
  const preview = previewCsvImport(source, { people: [], organizations: [], owners: [] });
  expect(preview.rows).toHaveLength(1);
  expect(preview.rows[0].normalizedValues).toMatchObject({ first_name: "Alice", last_name: "Test", organization: candidate.name, comments: review.notes });
  expect(validateCsvImportMapping(preview.headers, source.mapping).valid).toBe(true);
});
it("rejects pending, excluded and unidentified contacts", () => {
  for (const change of [{ status: "pending" }, { status: "rejected" }, { last_name: "" }]) expect(() => buildProspectImport(listId, candidate, { ...review, ...change })).toThrow();
});
it("uses a stable key for retries and changes it after a new verification", () => {
  const first = buildProspectImport(listId, candidate, review);
  expect(buildProspectImport(listId, candidate, review).idempotencyKey).toBe(first.idempotencyKey);
  expect(buildProspectImport(listId, candidate, { ...review, reviewed_at: "2026-10-02T07:00:00Z" }).idempotencyKey).not.toBe(first.idempotencyKey);
});
