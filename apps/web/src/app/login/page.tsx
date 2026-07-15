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
        <p className="muted">Project Atlas</p>
        <h1>Connexion</h1>
        <LoginForm />
      </section>
    </main>
  );
}
