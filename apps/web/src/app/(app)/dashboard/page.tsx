import { Card } from "@/components/ui/card";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function DashboardPage() {
  const context = await getTenantContext();
  return (
    <div className="page stack">
      <header><p className="muted">Core Foundation</p><h1>Dashboard</h1></header>
      <div className="grid">
        <Card><h2>Tenant</h2><p>{context?.tenantId ?? "Aucun tenant actif"}</p></Card>
        <Card><h2>Role</h2><p>{context?.role ?? "Non rattache"}</p></Card>
        <Card><h2>Perimetre V1</h2><p>Recrutement et suivi de talents immobiliers.</p></Card>
      </div>
    </div>
  );
}
