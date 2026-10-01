import { expect, it } from "vitest";
import { reviewSchema } from "./review";
import { buildProspectImport } from "./integration";
const base = { listId: "11111111-1111-4111-8111-111111111111", siret: "12345678900012", status: "qualified", kind: "mandataire", firstName: "Alice", lastName: "Test", email: "alice@example.com", phone: "", sourceUrl: "https://example.com/alice", notes: "" };
const linkedin = { linkedinUrl: "https://www.linkedin.com/in/alice-test/", linkedinStatus: "consistent", linkedinRole: "Mandataire", linkedinNetwork: "Réseau Test", linkedinArea: "Saint-Maur-des-Fossés", linkedinEvidence: "Nom, réseau et secteur concordants avec la fiche professionnelle.", linkedinCheckedOn: "2026-10-01" };
it("does not reject an otherwise qualified contact solely for an unavailable or missing LinkedIn profile", () => {
  expect(reviewSchema.safeParse(base).success).toBe(true);
  for (const linkedinStatus of ["not_found", "unavailable"]) expect(reviewSchema.safeParse({ ...base, linkedinStatus, linkedinCheckedOn: "2026-10-01" }).success).toBe(true);
});
it("requires dated evidence, a profile, role and area before declaring consistency", () => {
  expect(reviewSchema.safeParse({ ...base, ...linkedin }).success).toBe(true);
  for (const key of ["linkedinUrl", "linkedinRole", "linkedinArea", "linkedinEvidence", "linkedinCheckedOn"]) expect(reviewSchema.safeParse({ ...base, ...linkedin, [key]: "" }).success).toBe(false);
});
it("rejects lookalike domains, credentials and non-profile URLs", () => {
  for (const linkedinUrl of ["https://linkedin.com.evil.test/in/alice", "https://evil@www.linkedin.com/in/alice", "https://www.linkedin.com/company/test", "http://www.linkedin.com/in/alice"]) expect(reviewSchema.safeParse({ ...base, ...linkedin, linkedinUrl }).success).toBe(false);
});
it("blocks qualification and integration while contradictory evidence remains unresolved", () => {
  expect(reviewSchema.safeParse({ ...base, ...linkedin, linkedinStatus: "conflict" }).success).toBe(false);
  expect(reviewSchema.safeParse({ ...base, ...linkedin, status: "pending", linkedinStatus: "conflict" }).success).toBe(true);
  expect(() => buildProspectImport(base.listId, { siret: base.siret, name: "Agence", city: "Saint-Maur", postalCode: "94100" }, { status: "qualified", kind: "mandataire", last_name: "Test", email: base.email, phone: "", source_url: base.sourceUrl, notes: "", linkedin_status: "conflict", linkedin_url: linkedin.linkedinUrl, linkedin_evidence: linkedin.linkedinEvidence, linkedin_checked_on: linkedin.linkedinCheckedOn })).toThrow();
});
it("keeps the evidence with the contact in the integration payload", () => {
  const result = buildProspectImport(base.listId, { siret: base.siret, name: "Agence", city: "Saint-Maur", postalCode: "94100" }, { status: "qualified", kind: "mandataire", last_name: "Test", email: base.email, phone: "", source_url: base.sourceUrl, notes: "", reviewed_at: "2026-10-01T07:00:00Z", linkedin_status: "consistent", linkedin_url: linkedin.linkedinUrl, linkedin_evidence: linkedin.linkedinEvidence, linkedin_checked_on: linkedin.linkedinCheckedOn, linkedin_role: linkedin.linkedinRole, linkedin_area: linkedin.linkedinArea });
  expect(result.content).toContain(linkedin.linkedinUrl);
  expect(result.content).toContain(linkedin.linkedinEvidence);
});
