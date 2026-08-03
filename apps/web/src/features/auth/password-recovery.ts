import { z } from "zod";

export const PASSWORD_RESET_PATH = "/update-password";
export const PASSWORD_RESET_GENERIC_MESSAGE =
  "Si un compte existe pour cette adresse, un e-mail de reinitialisation a ete envoye.";
export const PASSWORD_UPDATE_SUCCESS_MESSAGE =
  "Votre mot de passe a ete mis a jour. Vous allez etre redirige vers la connexion.";
export const PASSWORD_UPDATE_ERROR_MESSAGE =
  "Le mot de passe n'a pas pu etre mis a jour. Veuillez rouvrir le lien de reinitialisation.";
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
  code?: string;
  message?: string;
};

function getSafeAuthDiagnostic(stage: SafeAuthDiagnostic["stage"], error: unknown): SafeAuthDiagnostic {
  if (!error || typeof error !== "object") return { stage };

  const candidate = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
  return {
    stage,
    code: typeof candidate.code === "string"
      ? candidate.code
      : typeof candidate.status === "number"
        ? String(candidate.status)
        : typeof candidate.name === "string"
          ? candidate.name
          : undefined,
    message: typeof candidate.message === "string" ? candidate.message : undefined
  };
}

export function formatSafeAuthDiagnostic(diagnostic: SafeAuthDiagnostic | null | undefined) {
  if (!diagnostic) return null;

  const details = [
    diagnostic.stage,
    diagnostic.code ? `code=${diagnostic.code}` : null,
    diagnostic.message ? `message=${diagnostic.message}` : null
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
  for (let attempt = 0; attempt < RECOVERY_SESSION_CHECKS; attempt += 1) {
    const { data: { session } } = await client.auth.getSession();
    if (session) return true;

    if (attempt < RECOVERY_SESSION_CHECKS - 1) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, RECOVERY_SESSION_CHECK_DELAY_MS));
    }
  }

  return false;
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
    const hasSession = await waitForRecoverySession({ auth: { getSession: client.auth.getSession } });
    if (!hasSession) {
      return {
        ok: false,
        message: PASSWORD_UPDATE_ERROR_MESSAGE,
        diagnostic: { stage: "session_check" as const, message: "No effective recovery session before updateUser" }
      };
    }
  }

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: PASSWORD_UPDATE_ERROR_MESSAGE, diagnostic: getSafeAuthDiagnostic("update_user", error) };

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
    const hasAutoDetectedSession = await waitForRecoverySession(client);
    if (hasAutoDetectedSession) return { ok: true };

    const { error } = await client.auth.setSession(recoveryHashSession);
    if (error) return { ok: false, diagnostic: getSafeAuthDiagnostic("set_session", error) };

    return { ok: await waitForRecoverySession(client) };
  }

  return { ok: await waitForRecoverySession(client) };
}
