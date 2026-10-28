import { getTenantContext } from "@/repositories/tenant-context";
import { verifyVscConnection, type VscConnectionStatus } from "@/services/brevo-vsc";
export const dynamic = "force-dynamic";
const messages: Record<VscConnectionStatus, string> = {
  forbidden: "Cette connexion est réservée aux administrateurs de VendreSonCommerce.",
  unconfigured: "La clé de connexion n’est pas encore disponible sur cette version d’Atlas.",
  connected: "Connexion vérifiée au compte contact@vendresoncommerce.com.",
  wrong_account: "La clé ne correspond pas au compte VendreSonCommerce. Connexion refusée.",
  unavailable: "Vérification impossible pour le moment. Vérifiez que la clé Brevo est active, puis réessayez."
};
export default async function VscBrevoPage() {
  const status = await verifyVscConnection(await getTenantContext());
  return <div className="page stack">
    <h1>Brevo · VendreSonCommerce</h1>
    <section className="card stack">
      <h2>{status === "connected" ? "Compte connecté" : "Connexion à vérifier"}</h2>
      <p role="status">{messages[status]}</p>
      <p>Cette vérification consulte uniquement l’identité du compte. Aucun contact n’est importé et aucun email ou SMS n’est envoyé.</p>
      <a className="button" href="/admin/brevo-vsc">Vérifier à nouveau</a>
    </section>
  </div>;
}
