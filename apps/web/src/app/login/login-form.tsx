"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label htmlFor="login-email">Email</label>
      <Input id="login-email" name="email" type="email" required autoComplete="email" />
      <div className="field">
        <label htmlFor="login-password">Mot de passe</label>
        <span className="password-field">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
          />
          <button
            type="button"
            className="password-toggle"
            data-password-toggle="true"
            aria-controls="login-password"
            data-visible={showPassword ? "true" : "false"}
            aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            onClick={() => setShowPassword((current) => !current)}
          >
            <span className="password-icon password-icon-visible"><EyeIcon /></span>
            <span className="password-icon password-icon-hidden"><EyeOffIcon /></span>
          </button>
        </span>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <Button type="submit" disabled={loading}>{loading ? "Connexion..." : "Se connecter"}</Button>
      <PasswordToggleFallback />
    </form>
  );
}

function PasswordToggleFallback() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
document.addEventListener("click", function (event) {
  var target = event.target;
  if (!(target instanceof Element)) return;
  var button = target.closest("[data-password-toggle]");
  if (!button) return;
  var inputId = button.getAttribute("aria-controls");
  if (!inputId) return;
  var input = document.getElementById(inputId);
  if (!(input instanceof HTMLInputElement)) return;
  var shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  var label = shouldShow ? "Masquer le mot de passe" : "Afficher le mot de passe";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.setAttribute("data-visible", shouldShow ? "true" : "false");
});
        `.trim()
      }}
    />
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="m3 3 18 18" />
      <path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6 0 9.5 7 9.5 7a17.8 17.8 0 0 1-3.1 4.1" />
      <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
      <path d="M6.2 6.9A17.6 17.6 0 0 0 2.5 12s3.5 7 9.5 7a10.8 10.8 0 0 0 4-.8" />
    </svg>
  );
}
