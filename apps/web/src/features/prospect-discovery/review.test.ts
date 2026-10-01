import { expect, it } from "vitest";
import { reviewSchema } from "./review";
const base = { listId: "11111111-1111-4111-8111-111111111111", siret: "12345678900012", status: "qualified", kind: "mandataire", email: "", phone: "06 12 34 56 78", sourceUrl: "https://example.com/contact", notes: "" };
it("requires a source and confirmed activity before qualification", () => {
  expect(reviewSchema.safeParse({ ...base, sourceUrl: "" }).success).toBe(false);
  expect(reviewSchema.safeParse({ ...base, kind: "unknown" }).success).toBe(false);
  expect(reviewSchema.safeParse({ ...base, phone: "" }).success).toBe(false);
});
it("allows pending or rejected profiles without contact details", () => {
  for (const status of ["pending", "rejected"]) expect(reviewSchema.safeParse({ ...base, status, kind: "unknown", phone: "", sourceUrl: "" }).success).toBe(true);
});
it("rejects unsafe source links and malformed contact details", () => {
  for (const sourceUrl of ["javascript:alert(1)", "https://user:password@example.com"]) expect(reviewSchema.safeParse({ ...base, sourceUrl }).success).toBe(false);
  expect(reviewSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
  expect(reviewSchema.safeParse({ ...base, email: "invalid" }).success).toBe(false);
});
it("normalizes a valid professional phone", () => {
  expect(reviewSchema.parse(base).phone).toBe("0612345678");
});
