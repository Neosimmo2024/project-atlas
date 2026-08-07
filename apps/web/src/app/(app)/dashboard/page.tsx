import { Card } from "@/components/ui/card";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function DashboardPage() {
  const context = await getTenantContext();
  return (
    <div className="page stack">
      <header><p className="muted">Fondation Atlas</p><h1>Tableau de bord</h1></header>
      <div className="grid">
        <Card><h2>Tenant</h2><p>{context?.tenant.name ?? "Aucun tenant actif"}</p></Card>
        <Card><h2>Rôle</h2><p>{context?.role ?? "Non rattaché"}</p></Card>
        <Card><h2>Périmètre V1</h2><p>Recrutement et suivi de talents immobiliers.</p></Card>
      </div>
    </div>
  );
}
