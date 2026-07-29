import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  accountIdentityLabel,
  roleDisplayLabel,
  sessionAccountSummary,
  tenantDisplayLabel
} from "./session-account";

describe("session account indicator", () => {
  it("formats connected account labels from profile, tenant and role", () => {
    expect(sessionAccountSummary({
      fullName: "Ada Lovelace",
      email: "ada@example.test",
      tenantName: "Atlas Test Tenant",
      role: "owner"
    })).toEqual({
      statusLabel: "Connecté",
      identityLabel: "Ada Lovelace",
      tenantLabel: "Atlas Test Tenant",
      roleLabel: "Propriétaire"
    });
  });

  it("falls back to email and safe missing tenant or role labels", () => {
    expect(accountIdentityLabel(null, "user@example.test")).toBe("user@example.test");
    expect(accountIdentityLabel(null, null)).toBe("Utilisateur Atlas");
    expect(tenantDisplayLabel(null)).toBe("Aucun tenant actif");
    expect(roleDisplayLabel(null)).toBe("Rôle non défini");
  });

  it("renders the account indicator and sign-out control in the Atlas shell", () => {
    const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    const layout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(layout).toContain("getSessionAccountSummary");
    expect(layout).toContain("<AppShell account={account}>");
    expect(shell).toContain("Compte utilisateur connecté");
    expect(shell).toContain("account-status-dot");
    expect(shell).toContain("Se déconnecter");
    expect(shell).toContain("supabase.auth.signOut()");
    expect(shell).toContain('router.replace("/login")');
    expect(shell).toContain("router.refresh()");
    expect(styles).toContain(".account-indicator");
    expect(styles).toContain(".account-status-dot");
  });

  it("keeps the account indicator available inside the mobile sidebar menu", () => {
    const shell = readFileSync(join(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(shell).toContain("<AccountIndicator account={account} />");
    expect(shell).toContain("sidebar sidebar-open");
    expect(styles).toContain(".sidebar.sidebar-open");
    expect(styles).toContain("overflow-y: auto");
  });
});
