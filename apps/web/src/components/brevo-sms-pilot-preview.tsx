"use client";

import { useState } from "react";
import { prepareSmsPilotPreview, SMS_PILOT_MESSAGE, type SmsPilotPreview } from "@/features/recruitment-sms/pilot-preview";

export function BrevoSmsPilotPreview() {
  const [phone, setPhone] = useState("");
  const [preview, setPreview] = useState<SmsPilotPreview | null>(null);
  return <section className="card stack" aria-labelledby="sms-pilot-title">
    <h2 id="sms-pilot-title">Préparer mon test SMS</h2>
    <p>Prépare un test sur ton propre mobile. Le numéro reste dans ce navigateur : cet aperçu ne crée aucun contact et n’envoie aucun SMS.</p>
    <p><strong>Message prévu :</strong> {SMS_PILOT_MESSAGE}</p>
    <form className="stack" onSubmit={event => { event.preventDefault(); setPreview(prepareSmsPilotPreview(phone)); }}>
      <label htmlFor="sms-pilot-phone">Mon numéro mobile français
        <input id="sms-pilot-phone" type="tel" inputMode="tel" autoComplete="off" maxLength={40} required value={phone}
          placeholder="06 ou 07…" onChange={event => { setPhone(event.target.value); setPreview(null); }} />
      </label>
      <div><button type="submit" className="button subtle-button">Vérifier l’aperçu sans envoyer</button></div>
    </form>
    <div role="status" aria-live="polite">
      {preview?.status === "invalid" ? <p>{preview.message}</p> : preview?.status === "prepared" ? <>
        <p><strong>Aperçu prêt — aucun SMS envoyé.</strong></p>
        <p>Destinataire : {preview.recipient}</p>
        <p>{preview.content}</p>
        <p>{preview.characterCount} caractères. Le format du numéro est reconnu ; sa capacité à recevoir un SMS reste à vérifier.</p>
      </> : null}
    </div>
    <p className="muted">L’envoi réel reste désactivé. Il nécessitera la vérification du compte SMS et ton accord sur ce numéro et ce message.</p>
  </section>;
}
