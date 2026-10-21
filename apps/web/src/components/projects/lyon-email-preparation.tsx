"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isLyonCampaignReady, LYON_SENDER, type LyonCampaign } from "@/features/recruitment-email/lyon-campaign";

export function LyonEmailPreparation({ projectId, campaign, canPrepare }: { projectId: string; campaign: LyonCampaign | null; canPrepare: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ready = isLyonCampaignReady(campaign);
  async function prepare() {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/recruitment-email/prepare`, { method: "POST" });
      const result = await response.json();
      setMessage(response.ok ? "Campagne préparée. Aucun email envoyé ni programmé." : result.error ?? "Préparation impossible.");
      if (response.ok) router.refresh();
    } catch { setMessage("Le service est temporairement indisponible."); }
    finally { setLoading(false); }
  }
  return <section className="card stack" aria-label="Campagne email Lyon">
    <div className="page-header"><h2>Campagne email Lyon</h2><span className="status-pill">{ready ? "Prête — non lancée" : "À préparer"}</span></div>
    <p>Premier email à J0, suivi à J+17, dernier suivi à J+32. Campagne distincte des envois nationaux.</p>
    <p><strong>Expéditeur :</strong> {LYON_SENDER}<br /><strong>Destinataires préparés :</strong> {campaign?.recipient_ids.length ?? 0}</p>
    {campaign?.template_ids ? <p>Les trois modèles Lyon sont raccordés à Brevo. Aucun envoi ni programmation avant le lancement et l’autorisation des contacts.</p> : null}
    <p>Les autres profils restent à compléter ou à vérifier. Les suivis s’arrêtent à la réponse, au rendez-vous, au refus ou à la désinscription.</p>
    {canPrepare && !ready ? <Button type="button" onClick={prepare} disabled={loading || !campaign}>{loading ? "Préparation…" : "Préparer les emails Lyon sans envoyer"}</Button> : null}
    {message ? <p aria-live="polite">{message}</p> : null}
  </section>;
}
