import { z } from "zod";

export const PASSWORD_RESET_PATH = "/update-password";
export const PASSWORD_RESET_GENERIC_MESSAGE =
  "Si un compte existe pour cette adresse, un e-mail de reinitialisation a ete envoye.";
export const PASSWORD_UPDATE_SUCCESS_MESSAGE =
  "Votre mot de passe a ete mis a jour. Vous allez etre redirige vers la connexion.";
export const PASSWORD_UPDATE_ERROR_MESSAGE =
  "Le mot de passe n'a pas pu etre mis a jour. Veuillez rouvrir le lien de reinitialisation.";
export const PASSWORD_AUTH_CONNECTION_ERROR_MESSAGE =
  "La connexion au service d'authentification a echoue. Veuillez reessayer dans quelques instants.";
export const PASSWORD_UPDATE_DIAGNOSTIC_PREFIX = "Diagnostic securise";

const emailSchema = z.object({
  email: z.string().trim().email("Veuillez saisir une adresse e-mail valide.")
});

const newPasswordSchema = z.object({
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caracteres."),
  confirmPassword: z.string().min(1, "Veuillez confirmer le mot de passe.")
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas.",
  path: ["confirmPassword"]
});

type SupabasePasswordRecoveryClient = {
  auth: {
    resetPasswordForEmail: (
      email: string,
      options: { redirectTo: string }
    ) => Promise<{ error: unknown | null }>;
    updateUser: (attributes: { password: string }) => Promise<{ error: unknown | null }>;
    getSession?: () => Promise<{ data: { session: unknown | null } }>;
  };
};

type SupabaseRecoverySessionClient = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<{ error: unknown | null }>;
    setSession?: (session: { access_token: string; refresh_token: string }) => Promise<{ error: unknown | null }>;
    getSession: () => Promise<{ data: { session: unknown | null } }>;
  };
};

const RECOVERY_SESSION_CHECKS = 5;
const RECOVERY_SESSION_CHECK_DELAY_MS = 150;

type SafeAuthDiagnostic = {
  stage: "session_check" | "set_session" | "update_user";
  name?: string;
  code?: string;
  status?: string;
  message?: string;
};

const SENSITIVE_DIAGNOSTIC_VALUE = /\b(?:access_token|refresh_token|password|sb_publishable[^\s]*|sb_secret[^\s]*|eyJ[A-Za-z0-9_-]+)\b[^\s]*/gi;

function sanitizeDiagnosticValue(value: string) {
  return value.replace(SENSITIVE_DIAGNOSTIC_VALUE, "[redacted]");
}

function getSafeAuthDiagnostic(stage: SafeAuthDiagnostic["stage"], error: unknown): SafeAuthDiagnostic {
  if (!error || typeof error !== "object") return { stage };

  const candidate = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
  return {
    stage,
    name: typeof candidate.name === "string" ? sanitizeDiagnosticValue(candidate.name) : undefined,
    code: typeof candidate.code === "string" ? sanitizeDiagnosticValue(candidate.code) : undefined,
    status: typeof candidate.status === "number" || typeof candidate.status === "string"
      ? sanitizeDiagnosticValue(String(candidate.status))
      : undefined,
    message: typeof candidate.message === "string" ? sanitizeDiagnosticValue(candidate.message) : undefined
  };
}

export function formatSafeAuthDiagnostic(diagnostic: SafeAuthDiagnostic | null | undefined) {
  if (!diagnostic) return null;

  const details = [
    diagnostic.stage,
    diagnostic.name ? `name=${sanitizeDiagnosticValue(diagnostic.name)}` : null,
    diagnostic.code ? `code=${sanitizeDiagnosticValue(diagnostic.code)}` : null,
    diagnostic.status ? `status=${sanitizeDiagnosticValue(diagnostic.status)}` : null,
    diagnostic.message ? `message=${sanitizeDiagnosticValue(diagnostic.message)}` : null
  ].filter(Boolean).join(" ");

  return `${PASSWORD_UPDATE_DIAGNOSTIC_PREFIX}: ${details}`;
}

export function validatePasswordResetEmail(input: { email: string }) {
  return emailSchema.safeParse(input);
}

export function validateNewPassword(input: { password: string; confirmPassword: string }) {
  return newPasswordSchema.safeParse(input);
}

export function getPasswordResetRedirectTo(origin: string) {
  return new URL(PASSWORD_RESET_PATH, origin).toString();
}

export function getRecoveryHashSession(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!isPasswordRecoveryHash(hash)) return null;

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  return { access_token: accessToken, refresh_token: refreshToken };
}

export function isPasswordRecoveryHash(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("type") === "recovery" && Boolean(params.get("access_token"));
}

export function getPasswordRecoveryRedirectPath(hash: string) {
  if (!isPasswordRecoveryHash(hash)) return null;
  return `${PASSWORD_RESET_PATH}${hash.startsWith("#") ? hash : `#${hash}`}`;
}

async function waitForRecoverySession(client: { auth: { getSession: () => Promise<{ data: { session: unknown | null } }> } }) {
  try {
    for (let attempt = 0; attempt < RECOVERY_SESSION_CHECKS; attempt += 1) {
      const { data: { session } } = await client.auth.getSession();
      if (session) return { ok: true };

      if (attempt < RECOVERY_SESSION_CHECKS - 1) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, RECOVERY_SESSION_CHECK_DELAY_MS));
      }
    }
  } catch (error) {
    return { ok: false, diagnostic: getSafeAuthDiagnostic("session_check", error) };
  }

  return { ok: false };
}

export async function requestPasswordReset(client: SupabasePasswordRecoveryClient, email: string, origin: string) {
  const parsed = validatePasswordResetEmail({ email });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Adresse e-mail invalide." };

  try {
    await client.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: getPasswordResetRedirectTo(origin)
    });
  } catch {
    // Keep the public response identical so account existence cannot be inferred.
  }

  return { ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
}

export async function updatePassword(client: SupabasePasswordRecoveryClient, input: { password: string; confirmPassword: string }) {
  const parsed = validateNewPassword(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? PASSWORD_UPDATE_ERROR_MESSAGE };

  if (client.auth.getSession) {
    const sessionResult = await waitForRecoverySession({ auth: { getSession: client.auth.getSession } });
    if (!sessionResult.ok) {
      return {
        ok: false,
        message: sessionResult.diagnostic ? PASSWORD_AUTH_CONNECTION_ERROR_MESSAGE : PASSWORD_UPDATE_ERROR_MESSAGE,
        diagnostic: sessionResult.diagnostic ?? { stage: "session_check" as const, message: "No effective recovery session before updateUser" }
      };
    }
  }

  try {
    const { error } = await client.auth.updateUser({ password: parsed.data.password });
    if (error) return { ok: false, message: PASSWORD_UPDATE_ERROR_MESSAGE, diagnostic: getSafeAuthDiagnostic("update_user", error) };
  } catch (error) {
    return { ok: false, message: PASSWORD_AUTH_CONNECTION_ERROR_MESSAGE, diagnostic: getSafeAuthDiagnostic("update_user", error) };
  }

  return { ok: true, message: PASSWORD_UPDATE_SUCCESS_MESSAGE };
}

export async function ensurePasswordRecoverySession(
  client: SupabaseRecoverySessionClient,
  code: string | null,
  hash: string
) {
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return { ok: true };
  }

  const recoveryHashSession = getRecoveryHashSession(hash);
  if (recoveryHashSession && client.auth.setSession) {
    const autoDetectedSession = await waitForRecoverySession(client);
    if (autoDetectedSession.ok) return { ok: true };
    if (autoDetectedSession.diagnostic) return { ok: false, diagnostic: autoDetectedSession.diagnostic };

    try {
      const { error } = await client.auth.setSession(recoveryHashSession);
      if (error) return { ok: false, diagnostic: getSafeAuthDiagnostic("set_session", error) };
    } catch (error) {
      return { ok: false, diagnostic: getSafeAuthDiagnostic("set_session", error) };
    }

    return await waitForRecoverySession(client);
  }

  return await waitForRecoverySession(client);
}
