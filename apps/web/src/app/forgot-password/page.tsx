import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-panel auth-single-panel">
        <div className="login-form-panel">
          <div className="login-form-heading">
            <p className="login-kicker">Mot de passe</p>
            <h1>Réinitialisation</h1>
            <p className="auth-helper">Saisissez votre adresse e-mail pour recevoir un lien sécurisé.</p>
          </div>
          <ForgotPasswordForm />
        </div>
      </section>
    </main>
  );
}
