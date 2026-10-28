import { AppShell } from "@/components/app-shell";
import { getSessionAccountSummary } from "@/repositories/session-account";
import { getAvailableTenants, getTenantContext } from "@/repositories/tenant-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [account, tenants, activeTenant] = await Promise.all([
    getSessionAccountSummary(), getAvailableTenants(), getTenantContext()
  ]);
  return <AppShell account={account} tenants={tenants} activeTenantId={activeTenant?.tenantId ?? null}>{children}</AppShell>;
}
