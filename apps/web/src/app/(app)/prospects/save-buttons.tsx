"use client";
import { useFormStatus } from "react-dom";

export function SaveProspectButtons() {
  const { pending } = useFormStatus();
  return <div className="stack">
    <button className="button" type="submit" name="scope" value="all" disabled={pending}>Enregistrer toutes les pages dans une liste</button>
    <button className="button subtle-button" type="submit" name="scope" value="page" disabled={pending}>Enregistrer uniquement cette page</button>
    {pending ? <p role="status">Actualisation des résultats et enregistrement en cours. Gardez cette page ouverte ; la collecte peut prendre environ une minute.</p> : null}
  </div>;
}
