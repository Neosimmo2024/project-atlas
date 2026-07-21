import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  PASSWORD_RESET_GENERIC_MESSAGE,
  PASSWORD_RESET_REDIRECT_TO,
  PASSWORD_UPDATE_ERROR_MESSAGE,
  PASSWORD_UPDATE_SUCCESS_MESSAGE,
  requestPasswordReset,
  updatePassword,
  validateNewPassword,
  validatePasswordResetEmail
} from "./password-recovery";

type RecoveryClient = Parameters<typeof requestPasswordReset>[0];
type ResetPasswordForEmail = RecoveryClient["auth"]["resetPasswordForEmail"];
type UpdateUser = RecoveryClient["auth"]["updateUser"];

function client(overrides: Partial<{
  resetPasswordForEmail: ResetPasswordForEmail;
  updateUser: UpdateUser;
}> = {}): RecoveryClient {
  return {
    auth: {
      resetPasswordForEmail: overrides.resetPasswordForEmail ?? vi.fn<ResetPasswordForEmail>().mockResolvedValue({ error: null }),
      updateUser: overrides.updateUser ?? vi.fn<UpdateUser>().mockResolvedValue({ error: null })
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
    const result = await requestPasswordReset(client({ resetPasswordForEmail }), "renato@example.com");

    expect(result).toEqual({ ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("renato@example.com", {
      redirectTo: PASSWORD_RESET_REDIRECT_TO
    });
  });

  it("does not reveal account existence when Supabase throws during reset", async () => {
    const resetPasswordForEmail = vi.fn().mockRejectedValue(new Error("network failure"));
    const result = await requestPasswordReset(client({ resetPasswordForEmail }), "renato@example.com");

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
    const result = await updatePassword(client({ updateUser }), {
      password: "Password123",
      confirmPassword: "Password123"
    });

    expect(result).toEqual({ ok: true, message: PASSWORD_UPDATE_SUCCESS_MESSAGE });
    expect(updateUser).toHaveBeenCalledWith({ password: "Password123" });
  });

  it("returns a safe update error message when Supabase rejects the password change", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: "Auth session missing" } });
    const result = await updatePassword(client({ updateUser }), {
      password: "Password123",
      confirmPassword: "Password123"
    });

    expect(result).toEqual({ ok: false, message: PASSWORD_UPDATE_ERROR_MESSAGE });
  });

  it("keeps the login form using signInWithPassword", () => {
    const source = readFileSync(resolve(__dirname, "../../app/login/login-form.tsx"), "utf8");

    expect(source).toContain("signInWithPassword");
    expect(source).toContain('autoComplete="email"');
    expect(source).toContain('autoComplete="current-password"');
  });
});
