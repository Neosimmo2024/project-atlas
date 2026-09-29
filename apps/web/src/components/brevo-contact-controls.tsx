"use client";

import { useActionState } from "react";
import { contactCommandAction, diagnoseAccountAction, pilotContactAction } from "@/app/(app)/admin/brevo-contacts/actions";

type Diagnostic = Awaited<ReturnType<typeof diagnoseAccountAction>> | { status: "idle" };
export function BrevoAccountDiagnostic() {
  const [state, action, pending] = useActionState<Diagnostic, FormData>(async () => diagnoseAccountAction(), { status: "idle" });
  return <section className="card stack" aria-label="Compte Brevo">
    <h2>Vérifier le compte Brevo</h2>
    <p>Vérifiez que la connexion correspond au compte NEOS IMMO attendu. Cette vérification ne crée aucun contact et n’envoie aucun message.</p>
    <form action={action}><button className="button subtle-button" disabled={pending}>{pending ? "Vérification en cours…" : "Vérifier le compte connecté"}</button></form>
    <div role="status" aria-live="polite">
      {state.status === "account_identified" ? <>
        <p>Le compte correspond à l’adresse NEOS IMMO attendue.</p>
        <p>Identifiant d’organisation : <strong>{state.organizationId}</strong></p>
        <p>{state.bindingMatches ? "La liaison configurée correspond à ce compte." : "La liaison à cette organisation reste à configurer avant les contrôles de contacts."}</p>
      </> : state.status === "account_mismatch" ? <p>Le compte connecté ne correspond pas au compte NEOS IMMO attendu. Aucun contrôle de contact n’est lancé.</p>
        : state.status !== "idle" ? <p>Le compte n’a pas pu être vérifié. Contrôlez la configuration et vos droits.</p> : null}
    </div>
  </section>;
}

export function BrevoContactControls({ attemptId, canClose }: { attemptId: string; canClose: boolean }) {
  const [state, action, pending] = useActionState(contactCommandAction, { message: "" });
  return <div className="stack">
    <form action={action} className="stack">
      <input type="hidden" name="attemptId" value={attemptId} />
      <div><button className="button subtle-button" name="command" value="check" disabled={pending}>Vérifier dans Brevo</button></div>
      {canClose ? <>
        <label><input type="checkbox" name="confirmation" value="keep_blocked" disabled={pending} /> Je confirme la clôture de la revue en conservant le blocage de toute nouvelle tentative.</label>
        <div><button className="button subtle-button" name="command" value="close" disabled={pending}>Clôturer la revue sans relancer</button></div>
      </> : null}
    </form>
    <p role="status" aria-live="polite">{pending ? "Vérification en cours…" : state.message}</p>
  </div>;
}

export function BrevoContactPilot() {
  const [state, action, pending] = useActionState(pilotContactAction, { message: "" });
  return <section className="card stack" aria-label="Test d’un contact fictif">
    <h2>Test d’un contact fictif</h2>
    <p>Ce test est réservé au propriétaire de la QA. Il concerne uniquement la fiche fictive préparée pour ce parcours. Le contact sera créé avec les emails et SMS bloqués, sans inscription à une liste.</p>
    <form action={action} className="stack">
      <label><input type="checkbox" name="confirmation" value="create_one_blocklisted_test_contact" required disabled={pending} /> Je confirme le test sur un seul contact fictif, sans envoi.</label>
      <div><button className="button" disabled={pending}>{pending ? "Vérification en cours…" : "Créer ou vérifier le contact fictif"}</button></div>
    </form>
    <p role="status" aria-live="polite">{state.message}</p>
  </section>;
}
