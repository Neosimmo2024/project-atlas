"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/people", label: "People" },
  { href: "/organizations", label: "Organizations" },
  { href: "/relationships", label: "Relationships" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/interactions", label: "Interactions" },
  { href: "/tasks", label: "Tasks" },
  { href: "/projects", label: "Projets" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
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
        <button className="button subtle-button sidebar-close" type="button" onClick={() => setMenuOpen(false)}>Fermer</button>
      </aside>
      <main className="shell-content">{children}</main>
    </div>
  );
}
