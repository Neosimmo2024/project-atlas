'use client';
import {useState} from 'react';
import type {getVscPilotReview} from '@/services/vsc-pilot-review';
type Review=Awaited<ReturnType<typeof getVscPilotReview>>;
const date=(value:string)=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris'});
export function VscPilotReview(){
  const [review,setReview]=useState<Review|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function inspect(){
    setBusy(true);setError('');setReview(null);
    try{const response=await fetch('/api/admin/vsc-pilot-review',{cache:'no-store'});const data=await response.json();if(!response.ok||data.readOnly!==true||data.sendingEnabled!==false)throw new Error();setReview(data);}
    catch{setError('Bilan du pilote indisponible. Rechargez les contrôles.');}finally{setBusy(false);}
  }
  return <section className="card stack" aria-label="Bilan du pilote VSC">
    <h2>Préparer la décision de lancement</h2>
    <p>Ce bilan relit les brouillons, les dates et la collecte. Il ne sélectionne aucun destinataire et ne vaut pas validation d’envoi.</p>
    <button className="button" disabled={busy} onClick={()=>void inspect()}>Actualiser le bilan du pilote</button>
    {error?<p role="alert">{error}</p>:null}
    {review?<div role="status">
      <p>Vérifié le {date(review.checkedAt)}. {review.campaigns.total} campagnes ; {review.campaigns.approvedOrEnabled} dont l’état ou l’approbation demande une vérification.</p>
      <p>{review.collection.health==='healthy'?'Collecte complète récente.':'Collecte à contrôler avant le pilote.'} Dernier passage terminé : {review.collection.lastFinishedAt?date(review.collection.lastFinishedAt):'aucun'}.</p>
      <h3>Emails OVH conservés</h3>
      <ul>{review.emailGroups.map(g=><li key={`${g.step}-${g.scheduledAt}`}>{g.step==='consideration'?'Relance J+20':g.step==='last-chance'?'Dernier email':g.step} — {date(g.scheduledAt)} : {g.drafts} brouillons, {g.recipients} destinataires distincts, {g.lots} lots. {g.untouched?'Aucune tentative enregistrée.':'Des livraisons demandent une vérification.'}{g.overdue?' Date échue, aucun rattrapage automatique.':''}</li>)}</ul>
      <h3>Décisions SMS à prendre</h3>
      <p>{review.sms.emailMobile} contacts avec email et mobile ; {review.sms.mobileOnly} mobiles seuls. {review.sms.overdueReminders} rappels échus, {review.sms.unknownHistory} historiques manquants. {review.sms.deliveries} livraisons SMS enregistrées.</p>
      {review.sms.savedPlan?<p>Version sauvegardée : départ {review.sms.savedPlan.startDate}, {review.sms.savedPlan.recipients} mobiles seuls. {review.sms.savedPlan.overdue?'Ce départ est passé : une nouvelle date nécessite une décision explicite.':'Date à confirmer avant toute utilisation.'}</p>:<p>Aucune version mobile seul sauvegardée.</p>}
      <p>Simulation pour un départ aujourd’hui ({review.sms.proposal.startDate}), non sauvegardée et non programmée :</p>
      <ul>{review.sms.proposal.steps.map(s=><li key={s.date}>{s.date} — {s.promotional?'texte promotionnel':'texte hors promotion'}, {s.segments} segment(s). {s.providerDayAllowed?'Jour compatible avec le contrôle du transport.':'Jour à revoir avant toute programmation.'}</li>)}</ul>
      <p>Avant le pilote : désigner une adresse email et un mobile de test autorisés, décider du rattrapage des rappels échus et du départ des mobiles seuls. Les textes, destinataires et cadence commerciaux seront ensuite présentés pour validation séparée.</p>
      <p>Ce bilan QA n’atteste ni une configuration de production ni un SMS livré. Les contrôles frais des réponses et oppositions restent requis avant un envoi autorisé.</p>
    </div>:null}
  </section>;
}
