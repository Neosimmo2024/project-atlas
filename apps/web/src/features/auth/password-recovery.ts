import { z } from "zod";

export const PASSWORD_RESET_REDIRECT_TO = "https://project-atlas-web-yzrb.vercel.app/update-password";
export const PASSWORD_RESET_GENERIC_MESSAGE =
  "Si un compte existe pour cette adresse, un e-mail de reinitialisation a ete envoye.";
export const PASSWORD_UPDATE_SUCCESS_MESSAGE =
  "Votre mot de passe a ete mis a jour. Vous allez etre redirige vers la connexion.";
export const PASSWORD_UPDATE_ERROR_MESSAGE =
  "Le mot de passe n'a pas pu etre mis a jour. Veuillez rouvrir le lien de reinitialisation.";

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
  };
};

type SupabaseRecoverySessionClient = {
  auth: {
    exchangeCodeForSession: (code: string) => Promise<{ error: unknown | null }>;
    getSession: () => Promise<{ data: { session: unknown | null } }>;
  };
};

export function validatePasswordResetEmail(input: { email: string }) {
  return emailSchema.safeParse(input);
}

export function validateNewPassword(input: { password: string; confirmPassword: string }) {
  return newPasswordSchema.safeParse(input);
}

export async function requestPasswordReset(client: SupabasePasswordRecoveryClient, email: string) {
  const parsed = validatePasswordResetEmail({ email });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Adresse e-mail invalide." };

  try {
    await client.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: PASSWORD_RESET_REDIRECT_TO
    });
  } catch {
    // Keep the public response identical so account existence cannot be inferred.
  }

  return { ok: true, message: PASSWORD_RESET_GENERIC_MESSAGE };
}

export async function updatePassword(client: SupabasePasswordRecoveryClient, input: { password: string; confirmPassword: string }) {
  const parsed = validateNewPassword(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? PASSWORD_UPDATE_ERROR_MESSAGE };

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: PASSWORD_UPDATE_ERROR_MESSAGE };

  return { ok: true, message: PASSWORD_UPDATE_SUCCESS_MESSAGE };
}

export async function ensurePasswordRecoverySession(client: SupabaseRecoverySessionClient, code: string | null) {
  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return { ok: true };
  }

  const { data: { session } } = await client.auth.getSession();
  return { ok: Boolean(session) };
}
