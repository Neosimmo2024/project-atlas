import { describe, expect, it } from "vitest";
import { attemptLogin } from "./login-result";

describe("login outcome", () => {
  it("does not misreport a network failure as invalid credentials", async () => {
    const message = await attemptLogin(async () => ({ error: { name: "AuthRetryableFetchError", message: "Failed to fetch" } }));
    expect(message).toContain("inaccessible");
    expect(message).not.toContain("incorrect");
  });
  it("settles a rejected network call so the form can leave its loading state", async () => {
    await expect(attemptLogin(async () => { throw new TypeError("private diagnostic"); })).resolves.toContain("inaccessible");
  });
  it("does not expose unexpected provider details", async () => {
    const message = await attemptLogin(async () => ({ error: { message: "private diagnostic" } }));
    expect(message).not.toContain("private diagnostic");
  });
  it("reports rejected credentials and success separately", async () => {
    await expect(attemptLogin(async () => ({ error: { code: "invalid_credentials" } }))).resolves.toBe("Email ou mot de passe incorrect.");
    await expect(attemptLogin(async () => ({ error: null }))).resolves.toBeNull();
  });
});
