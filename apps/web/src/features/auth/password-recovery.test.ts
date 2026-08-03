import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  PASSWORD_RESET_GENERIC_MESSAGE,
  formatSafeAuthDiagnostic,
  getPasswordResetRedirectTo,
  getPasswordRecoveryRedirectPath,
  getRecoveryHashSession,
  isPasswordRecoveryHash,
  PASSWORD_UPDATE_ERROR_MESSAGE,
  PASSWORD_UPDATE_SUCCESS_MESSAGE,
  ensurePasswordRecoverySession,
  requestPasswordReset,
  updatePassword,
  validateNewPassword,
  validatePasswordResetEmail
} from "./password-recovery";

type RecoveryClient = Parameters<typeof requestPasswordReset>[0];
type ResetPasswordForEmail = RecoveryClient["auth"]["resetPasswordForEmail"];
type UpdateUser = RecoveryClient["auth"]["updateUser"];
type RecoverySessionClient = Parameters<typeof ensurePasswordRecoverySession>[0];

function client(overrides: Partial<{
  resetPasswordForEmail: ResetPasswordForEmail;
  updateUser: UpdateUser;
  getSession: () => Promise<{ data: { session: unknown | null } }>;
}> = {}): RecoveryClient {
  return {
    auth: {
      resetPasswordForEmail: overrides.resetPasswordForEmail ?? vi.fn<ResetPasswordForEmail>().mockResolvedValue({ error: null }),
      updateUser: overrides.updateUser ?? vi.fn<UpdateUser>().mockResolvedValue({ error: null }),
      getSession: overrides.getSession
    }
  };
}

describe("password recovery", () => {
  it("validates reset email addresses", () => {
    expect(validatePasswordResetEmail({ email: "renato@example.com" }).success).toBe(true);
    const result = validatePasswordResetEmail({ email: "not-an-email" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Veuillez saisir une adresse e-mail valide.");
  });

  it("always returns a generic reset message for valid emails", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: { message: "User not found" } });
    const result = await requestPasswordReset(
      client({ resetPasswordForEmail }),
      "renato@example.com",
      "https://project-atlas-qa-beta-1.vercel.app"
    );

    expect(result).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("renato@example.com", {
      redirectTo: "https://project-atlas-qa-beta-1.vercel.app/update-password"
    });
  });

  it("builds the reset redirect from the current application origin", () => {
    expect(getPasswordResetRedirectTo("https://project-atlas-qa-beta-1.vercel.app"))
      .toBe("https://project-atlas-qa-beta-1.vercel.app/update-password");
    expect(getPasswordResetRedirectTo("http://127.0.0.1:3000"))
      .toBe("http://127.0.0.1:3000/update-password");
  });

  it("does not reveal account existence when Supabase throws during reset", async () => {
    const resetPasswordForEmail = vi.fn().mockRejectedValue(new Error("network failure"));
    const result = await requestPasswordReset(client({ resetPasswordForEmail }), "renato@example.com", "http://127.0.0.1:3000");

    expect(result).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
  });

  it("rejects different passwords", () => {
    const result = validateNewPassword({ password: "Password123", confirmPassword: "Password456" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Les mots de passe ne correspondent pas.");
  });

  it("rejects insufficient passwords", () => {
    const result = validateNewPassword({ password: "short", confirmPassword: "short" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Le mot de passe doit contenir au moins 8 caracteres.");
  });

  it("updates the user password through Supabase", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-a" } } } });
    const result = await updatePassword(client({ updateUser, getSession }), {
      password: "Password123",
      confirmPassword: "Password123"
    });

    expect(result).toEqual({ ok: true, message: PASSWORD_UPDATE_SUCCESS_MESSAGE });
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ password: "Password123" });
  });

  it("does not call updateUser when the recovery session is not effective", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    const result = await updatePassword(client({ updateUser, getSession }), {
      password: "Password123",
      confirmPassword: "Password123"
    });

    expect(result).toEqual({
      ok: false,
      message: PASSWORD_UPDATE_ERROR_MESSAGE,
      diagnostic: { stage: "session_check", message: "No effective recovery session before updateUser" }
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("returns a safe update error message when Supabase rejects the password change", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: "Auth session missing" } });
    const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-a" } } } });
    const result = await updatePassword(client({ updateUser, getSession }), {
      password: "Password123",
      confirmPassword: "Password123"
    });

    expect(result).toEqual({
      ok: false,
      message: PASSWORD_UPDATE_ERROR_MESSAGE,
      diagnostic: { stage: "update_user", code: undefined, message: "Auth session missing" }
    });
  });

  it("accepts a PKCE recovery code when Supabase exchanges it successfully", async () => {
    const exchangeCodeForSession = vi.fn<RecoverySessionClient["auth"]["exchangeCodeForSession"]>()
      .mockResolvedValue({ error: null });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValue({ data: { session: null } });

    await expect(ensurePasswordRecoverySession({
      auth: { exchangeCodeForSession, getSession }
    }, "recovery-code", "")).resolves.toEqual({ ok: true });

    expect(exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("accepts an already detected Supabase recovery hash session when the email link uses token fragments", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValue({ data: { session: { user: { id: "user-a" } } } });

    await expect(ensurePasswordRecoverySession({
      auth: {
        exchangeCodeForSession: vi.fn(),
        setSession,
        getSession
      }
    }, null, "#access_token=access-token&refresh_token=refresh-token&type=recovery"))
      .resolves.toEqual({ ok: true });

    expect(setSession).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("uses an already auto-detected Supabase recovery session before calling setSession again", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: { message: "Refresh token already consumed" } });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValue({ data: { session: { user: { id: "user-a" } } } });

    await expect(ensurePasswordRecoverySession({
      auth: {
        exchangeCodeForSession: vi.fn(),
        setSession,
        getSession
      }
    }, null, "#access_token=access-token&refresh_token=refresh-token&type=recovery"))
      .resolves.toEqual({ ok: true });

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("waits for the dashboard auto-detected recovery session before accepting the password form", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: { user: { id: "user-a" } } } });

    await expect(ensurePasswordRecoverySession({
      auth: {
        exchangeCodeForSession: vi.fn(),
        setSession,
        getSession
      }
    }, null, "#access_token=access-token&refresh_token=refresh-token&type=recovery"))
      .resolves.toEqual({ ok: true });

    expect(setSession).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("uses setSession as a fallback when the dashboard recovery hash is not auto-detected", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: { user: { id: "user-a" } } } });

    await expect(ensurePasswordRecoverySession({
      auth: {
        exchangeCodeForSession: vi.fn(),
        setSession,
        getSession
      }
    }, null, "#access_token=access-token&refresh_token=refresh-token&type=recovery"))
      .resolves.toEqual({ ok: true });

    expect(setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token"
    });
    expect(getSession).toHaveBeenCalledTimes(6);
  });

  it("rejects a Supabase dashboard recovery hash until setSession creates a readable session", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValue({ data: { session: null } });

    await expect(ensurePasswordRecoverySession({
      auth: {
        exchangeCodeForSession: vi.fn(),
        setSession,
        getSession
      }
    }, null, "#access_token=access-token&refresh_token=refresh-token&type=recovery"))
      .resolves.toEqual({ ok: false });

    expect(setSession).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledTimes(10);
  });

  it("ignores non-recovery hash fragments", () => {
    expect(getRecoveryHashSession("#access_token=access-token&refresh_token=refresh-token&type=signup")).toBeNull();
    expect(getRecoveryHashSession("#type=recovery&access_token=access-token")).toBeNull();
  });

  it("detects recovery hash fragments without exposing token values", () => {
    const recoveryHash = "#access_token=fake-access-token&refresh_token=fake-refresh-token&type=recovery";

    expect(isPasswordRecoveryHash(recoveryHash)).toBe(true);
    expect(getPasswordRecoveryRedirectPath(recoveryHash)).toBe(`/update-password${recoveryHash}`);
    expect(getPasswordRecoveryRedirectPath("access_token=fake-access-token&type=recovery"))
      .toBe("/update-password#access_token=fake-access-token&type=recovery");
    expect(getPasswordRecoveryRedirectPath("#access_token=fake-access-token&type=signup")).toBeNull();
  });

  it("accepts an already detected Supabase SSR recovery session after a reused PKCE code", async () => {
    const exchangeCodeForSession = vi.fn<RecoverySessionClient["auth"]["exchangeCodeForSession"]>()
      .mockResolvedValue({ error: { message: "invalid code" } });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValue({ data: { session: { user: { id: "user-a" } } } });

    await expect(ensurePasswordRecoverySession({
      auth: { exchangeCodeForSession, getSession }
    }, "recovery-code", "")).resolves.toEqual({ ok: true });

    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("rejects update-password when no recovery session is available", async () => {
    const exchangeCodeForSession = vi.fn<RecoverySessionClient["auth"]["exchangeCodeForSession"]>()
      .mockResolvedValue({ error: { message: "invalid code" } });
    const getSession = vi.fn<RecoverySessionClient["auth"]["getSession"]>()
      .mockResolvedValue({ data: { session: null } });

    await expect(ensurePasswordRecoverySession({
      auth: { exchangeCodeForSession, getSession }
    }, "recovery-code", "")).resolves.toEqual({ ok: false });
  });

  it("keeps the login form using signInWithPassword", () => {
    const source = readFileSync(resolve(__dirname, "../../app/login/login-form.tsx"), "utf8");

    expect(source).toContain("signInWithPassword");
    expect(source).toContain('autoComplete="email"');
    expect(source).toContain('autoComplete="current-password"');
  });

  it("keeps the request-new-link action on the forgot-password flow", () => {
    const source = readFileSync(resolve(__dirname, "../../app/update-password/update-password-form.tsx"), "utf8");

    expect(source).toContain('href="/forgot-password"');
    expect(source).toContain("Demander un nouveau lien");
    expect(source).toContain("onAuthStateChange");
    expect(source).toContain("auth_events");
  });

  it("formats safe auth diagnostics without token or password fields", () => {
    expect(formatSafeAuthDiagnostic({
      stage: "update_user",
      code: "401",
      message: "Auth session missing"
    })).toBe("Diagnostic securise: update_user code=401 message=Auth session missing");
  });

  it("keeps recovery fragments out of application logs", () => {
    const redirectSource = readFileSync(resolve(__dirname, "../../app/password-recovery-fragment-redirect.tsx"), "utf8");
    const rootSource = readFileSync(resolve(__dirname, "../../app/page.tsx"), "utf8");

    expect(`${redirectSource}\n${rootSource}`).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
