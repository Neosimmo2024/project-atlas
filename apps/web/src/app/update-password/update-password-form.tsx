"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PASSWORD_UPDATE_ERROR_MESSAGE,
  updatePassword
} from "@/features/auth/password-recovery";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type RecoveryState = "checking" | "ready" | "invalid";

export function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function prepareRecoverySession() {
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!mounted) return;
        setRecoveryState(exchangeError ? "invalid" : "ready");
        if (exchangeError) setError(PASSWORD_UPDATE_ERROR_MESSAGE);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setRecoveryState(session ? "ready" : "invalid");
      if (!session) setError(PASSWORD_UPDATE_ERROR_MESSAGE);
    }

    void prepareRecoverySession();

    return () => {
      mounted = false;
    };
  }, [searchParams, supabase]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const form = new FormData(event.currentTarget);
      const result = await updatePassword(supabase, {
        password: String(form.get("password") ?? ""),
        confirmPassword: String(form.get("confirmPassword") ?? "")
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      await supabase.auth.signOut();
      window.setTimeout(() => {
        router.replace("/login");
      }, 1200);
    } finally {
      setLoading(false);
    }
  }

  if (recoveryState === "checking") {
    return <p className="loading-state" role="status">Vérification du lien...</p>;
  }

  if (recoveryState === "invalid") {
    return (
      <div className="form">
        {error ? <p className="error" role="alert">{error}</p> : null}
        <Link className="auth-link auth-link-centered" href="/forgot-password">Demander un nouveau lien</Link>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label htmlFor="new-password">Nouveau mot de passe</label>
      <Input id="new-password" name="password" type="password" required autoComplete="new-password" />
      <label htmlFor="confirm-password">Confirmer le mot de passe</label>
      <Input id="confirm-password" name="confirmPassword" type="password" required autoComplete="new-password" />
      {message ? <p className="success" role="status">{message}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <Button type="submit" disabled={loading}>{loading ? "Mise à jour..." : "Mettre à jour"}</Button>
    </form>
  );
}
