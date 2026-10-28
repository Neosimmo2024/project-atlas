"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function LfiCampaignPreparation({ recipients, plannedAt }: { recipients: {id:string;email:string;status:string}[]; plannedAt: string | null }) {
 const router = useRouter();
 const [date, setDate] = useState("");
 const [recipientId, setRecipientId] = useState("");
 const [confirmed, setConfirmed] = useState(false);
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState("");
 async function submit(payload: object) {
  setBusy(true); setMessage("");
  try {
   const response = await fetch("/api/admin/lfi-campaign", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
   const data = await response.json();
   setMessage(response.ok ? data.result.message : data.error);
   if(response.ok) { setRecipientId(""); setConfirmed(false); router.refresh(); }
  } catch { setMessage("Enregistrement impossible. Réessayez."); }
  finally { setBusy(false); }
 }
 return <section className="card stack"><h2>Préparer le calendrier et suivre les inscriptions</h2>
 <p>Date prévue du premier lot (heure de Paris) : {plannedAt ? new Intl.DateTimeFormat("fr-FR", {timeZone:"Europe/Paris", dateStyle:"long",timeStyle:"short"}).format(new Date(plannedAt)) : "À définir"}.</p>
 <label>Nouvelle date prévue (heure locale de votre ordinateur)<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label>
 <p>La date doit précéder le 3 décembre 2026. Les messages partiront progressivement, au plus tôt à cette date, une fois l’envoi activé. L’enregistrer ici n’active pas la campagne.</p>
 <button className="button" disabled={busy || !date || !Number.isFinite(Date.parse(date))} onClick={()=>submit({action:"plan",dueAt:new Date(date).toISOString()})}>Enregistrer la date prévue — aucun envoi</button>
 <h3>Arrêter les messages d’un inscrit</h3><p>La synchronisation des inscriptions du site n’est pas encore connectée. Signalez ici chaque inscription confirmée pour annuler les messages encore en attente de ce contact.</p>
 <label>Contact inscrit<select value={recipientId} disabled={busy} onChange={e=>{setRecipientId(e.target.value);setConfirmed(false);}}><option value="">Choisir un contact</option>{recipients.filter(r=>r.status==="ready").map(r=><option key={r.id} value={r.id}>{r.email}</option>)}</select></label>
 <label><input type="checkbox" checked={confirmed} disabled={busy || !recipientId} onChange={e=>setConfirmed(e.target.checked)}/> Je confirme son inscription à la formation.</label>
 <button className="button" disabled={busy || !recipientId || !confirmed} onClick={()=>submit({action:"registered",recipientId})}>Inscription confirmée — arrêter les messages</button>
 {message && <p role="status">{message}</p>}
 </section>;
}
