type LoginError = { code?: string; status?: number; name?: string; message?: string };

export function loginErrorMessage(error: LoginError): string {
  if (error.code === "invalid_credentials") return "Email ou mot de passe incorrect.";
  if (error.code === "email_not_confirmed") return "Confirmez votre adresse email avant de vous connecter.";
  if (error.status === 429) return "Trop de tentatives. Patientez quelques minutes avant de réessayer.";
  if (error.name === "AuthRetryableFetchError" || /failed to fetch|network|load failed/i.test(error.message ?? "")) {
    return "Le service de connexion est momentanément inaccessible. Vérifiez votre connexion et réessayez. Cette erreur ne permet pas de vérifier votre mot de passe.";
  }
  return "La connexion n’a pas abouti. Réessayez plus tard.";
}

// Never display raw provider errors or persist credentials in diagnostics.
export async function attemptLogin(signIn: () => Promise<{ error: LoginError | null }>): Promise<string | null> {
  try {
    const { error } = await signIn();
    return error ? loginErrorMessage(error) : null;
  } catch {
    return "Le service de connexion est momentanément inaccessible. Vérifiez votre connexion et réessayez.";
  }
}
