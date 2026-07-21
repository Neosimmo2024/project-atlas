"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/features/auth/password-recovery";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      const result = await requestPasswordReset(supabase, String(form.get("email") ?? ""));
      if (result.ok) {
        setMessage(result.message);
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label htmlFor="forgot-email">Email</label>
      <Input id="forgot-email" name="email" type="email" required autoComplete="email" />
      {message ? <p className="success" role="status">{message}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <Button type="submit" disabled={loading}>{loading ? "Envoi..." : "Envoyer le lien"}</Button>
      <Link className="auth-link auth-link-centered" href="/login">Retour à la connexion</Link>
    </form>
  );
}
