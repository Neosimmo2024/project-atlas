import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planBrevoContactSync, type BrevoContactSnapshot, type ContactSyncInput } from "./brevo-contact-plan";

const tenant = "11111111-1111-4111-8111-111111111111";
const person = "22222222-2222-4222-8222-222222222222";
const externalId = `atlas:${tenant}:${person}`;
const input: ContactSyncInput = { tenantId: tenant, personId: person, email: "candidate@example.invalid", contactAllowed: true, doNotContact: false };
const existing: BrevoContactSnapshot = { id: 12, ext_id: externalId, email: input.email };
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network permitted"); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("Brevo contact sync planning without live writes", () => {
  it("prepares a normalized new contact with a tenant-scoped external id and no merge", () => {
    expect(planBrevoContactSync({ ...input, email: " Candidate@Example.Invalid " }, tenant, null)).toEqual({
      action: "create", externalId,
      request: { method: "POST", path: "/v3/contacts", body: { email: input.email, ext_id: externalId, updateEnabled: false, forceMerge: false } }
    });
  });
  it("blocks a tenant different from the trusted account binding", () => {
    expect(planBrevoContactSync(input, "33333333-3333-4333-8333-333333333333", null)).toEqual({ action: "blocked", reason: "tenant_mismatch" });
  });
  it.each(["", "../contacts", "invalid"]) ("rejects an invalid person identity: %s", personId => {
    expect(planBrevoContactSync({ ...input, personId }, tenant, null)).toEqual({ action: "blocked", reason: "invalid_identity" });
  });
  it.each([null, "", "bad email@example.invalid", "a@@example.invalid"]) ("rejects invalid email: %s", email => {
    expect(planBrevoContactSync({ ...input, email }, tenant, null)).toEqual({ action: "blocked", reason: "invalid_email" });
  });
  it.each([{ contactAllowed: false, doNotContact: false }, { contactAllowed: true, doNotContact: true }])("does not create an ineligible contact: %o", flags => {
    expect(planBrevoContactSync({ ...input, ...flags }, tenant, null)).toEqual({ action: "skip", reason: "contact_not_allowed" });
  });
  it("suppresses both channels for a previously linked contact that must not be contacted", () => {
    expect(planBrevoContactSync({ ...input, doNotContact: true, email: null }, tenant, existing)).toEqual({
      action: "suppress", externalId, request: { method: "PUT", path: "/v3/contacts/12?identifierType=contact_id", body: { emailBlacklisted: true, smsBlacklisted: true } }
    });
  });
  it("suppresses after permission is removed, without changing the existing email", () => {
    const plan = planBrevoContactSync({ ...input, contactAllowed: false, email: "new@example.invalid" }, tenant, existing);
    expect(plan.action).toBe("suppress");
    if (plan.action === "suppress") expect(plan.request.body).toEqual({ emailBlacklisted: true, smsBlacklisted: true });
  });
  it("does not repeat an already applied suppression", () => {
    expect(planBrevoContactSync({ ...input, doNotContact: true }, tenant, { ...existing, emailBlacklisted: true, smsBlacklisted: true })).toEqual({ action: "skip", reason: "already_blocklisted" });
  });
  it("never unblocks an existing contact even when local permission is true", () => {
    expect(planBrevoContactSync(input, tenant, { ...existing, emailBlacklisted: true })).toEqual({ action: "skip", reason: "already_linked" });
  });
  it.each([null, "atlas:other:person"]) ("refuses to adopt a contact with a different external identity: %s", ext_id => {
    expect(planBrevoContactSync(input, tenant, { ...existing, ext_id })).toEqual({ action: "blocked", reason: "identity_conflict" });
  });
  it("blocks an identity conflict even for suppression", () => {
    expect(planBrevoContactSync({ ...input, doNotContact: true }, tenant, { ...existing, ext_id: "other" })).toEqual({ action: "blocked", reason: "identity_conflict" });
  });
  it("requires review of email changes instead of potentially resubscribing", () => {
    expect(planBrevoContactSync({ ...input, email: "changed@example.invalid" }, tenant, existing)).toEqual({ action: "blocked", reason: "email_change_requires_review" });
  });
  it("ignores email casing and whitespace for an existing contact", () => {
    expect(planBrevoContactSync(input, tenant, { ...existing, email: " CANDIDATE@EXAMPLE.INVALID " })).toEqual({ action: "skip", reason: "already_linked" });
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid provider id: %s", id => {
    expect(planBrevoContactSync(input, tenant, { ...existing, id })).toEqual({ action: "blocked", reason: "invalid_contact" });
  });
  it("does not modify the supplied snapshot", () => {
    const snapshot = Object.freeze({ ...existing });
    planBrevoContactSync({ ...input, doNotContact: true }, tenant, snapshot);
    expect(snapshot).toEqual(existing);
  });
});
