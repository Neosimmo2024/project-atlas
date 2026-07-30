"use client";

import type { SessionAccountSummary } from "@/features/session-account/session-account";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/people", label: "People" },
  { href: "/organizations", label: "Organizations" },
  { href: "/relationships", label: "Relationships" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/interactions", label: "Interactions" },
  { href: "/tasks", label: "Tasks" },
  { href: "/projects", label: "Projets" },
  { href: "/imports", label: "Imports" }
];

function AccountIndicator({ account }: { account: SessionAccountSummary | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;

      router.replace("/login");
      router.refresh();
    } catch {
      setError("La déconnexion a échoué. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  if (!account) return null;

  return (
    <section className="account-indicator" aria-label="Compte utilisateur connecté">
      <div className="account-status-row">
        <span className="account-status-dot" aria-hidden="true" />
        <span>{account.statusLabel}</span>
      </div>
      <div className="account-details">
        <strong>{account.identityLabel}</strong>
        <span>{account.tenantLabel}</span>
        <span>{account.roleLabel}</span>
      </div>
      {error ? <p className="account-error" role="alert">{error}</p> : null}
      <button className="button subtle-button account-signout" type="button" onClick={handleSignOut} disabled={loading}>
        {loading ? "Déconnexion..." : "Se déconnecter"}
      </button>
    </section>
  );
}

export function AppShell({ children, account }: { children: React.ReactNode; account: SessionAccountSummary | null }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <div className="shell">
      <header className="mobile-shell-bar">
        <div>
          <p className="brand">Project Atlas</p>
          <p className="muted">Talent CRM</p>
        </div>
        <button
          aria-controls="atlas-sidebar"
          aria-expanded={menuOpen}
          className="button subtle-button shell-menu-button"
          type="button"
          onClick={() => setMenuOpen(true)}
        >
          Menu
        </button>
      </header>
      {menuOpen ? <button aria-label="Fermer le menu" className="shell-backdrop" type="button" onClick={() => setMenuOpen(false)} /> : null}
      <aside className={menuOpen ? "sidebar sidebar-open" : "sidebar"} id="atlas-sidebar">
        <div>
          <p className="brand">Project Atlas</p>
          <p className="muted">Talent CRM</p>
        </div>
        <nav>{navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
        <AccountIndicator account={account} />
        <button className="button subtle-button sidebar-close" type="button" onClick={() => setMenuOpen(false)}>Fermer</button>
      </aside>
      <main className="shell-content">{children}</main>
    </div>
  );
}
