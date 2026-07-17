import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-branding">
          <div>
            <p className="login-kicker">ATLAS</p>
            <p className="login-subtitle">Plateforme d’intelligence relationnelle</p>
          </div>
          <div className="login-welcome">
            <h1>Bienvenue dans Atlas</h1>
            <p>Pilotez vos relations, vos opportunités et vos décisions dans un seul espace.</p>
          </div>
          <div className="login-visual" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="login-security">Vos données sont sécurisées et isolées par organisation.</p>
        </div>
        <div className="login-form-panel">
          <div className="login-form-heading">
            <p className="login-kicker">Connexion</p>
            <h2>Accédez à votre espace Atlas</h2>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
