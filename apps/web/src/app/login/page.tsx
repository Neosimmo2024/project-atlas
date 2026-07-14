import { LoginForm } from "./login-form";

export default function LoginPage() {
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
