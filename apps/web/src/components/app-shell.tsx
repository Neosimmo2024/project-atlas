import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/people", label: "People" },
  { href: "/organizations", label: "Organisations" },
  { href: "/relationships", label: "Relations" },
  { href: "/interactions", label: "Échanges" },
  { href: "/tasks", label: "Tâches" },
  { href: "/action-plan", label: "Plan d’action" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="brand">Project Atlas</p>
          <p className="muted">Talent CRM</p>
        </div>
        <nav>{navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
      </aside>
      <main>{children}</main>
    </div>
  );
}
