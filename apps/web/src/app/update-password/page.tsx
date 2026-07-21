import { Suspense } from "react";

import { UpdatePasswordForm } from "./update-password-form";

export default function UpdatePasswordPage() {
  return (
    <main className="login-page">
      <section className="login-panel auth-single-panel">
        <div className="login-form-panel">
          <div className="login-form-heading">
            <p className="login-kicker">Sécurité</p>
            <h1>Nouveau mot de passe</h1>
            <p className="auth-helper">Choisissez un nouveau mot de passe pour votre espace Atlas.</p>
          </div>
          <Suspense fallback={<p className="loading-state">Vérification du lien...</p>}>
            <UpdatePasswordForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
