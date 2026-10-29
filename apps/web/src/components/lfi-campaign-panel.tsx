"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
type Candidate={id:string;first_name:string|null;last_name:string|null;city:string|null;primary_email:string|null};
export function LfiCampaignPanel({candidates}:{candidates:Candidate[]}){
 const router=useRouter();const [selected,setSelected]=useState<string[]>([]);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 async function action(action:string){setBusy(true);setMessage("");try{const response=await fetch("/api/admin/lfi-campaign",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,ids:selected})});const data=await response.json();setMessage(response.ok?(data.result?.message || "Préparation enregistrée. Aucun email envoyé."):(data.error || "Opération indisponible."));if(response.ok)router.refresh();}catch{setMessage("Opération indisponible.");}finally{setBusy(false);}}
 return <section className="card stack"><h2>Préparer un premier lot</h2><p>Professionnels d’Île-de-France autorisés au contact dans Atlas. Les campagnes des autres sociétés, notamment NEOS IMMO, ne bloquent pas cette sélection. Les exclusions propres aux Formateurs Immo restent appliquées.</p>
 {candidates.map(p=><label key={p.id}><input type="checkbox" disabled={busy || (!selected.includes(p.id)&&selected.length>=20)} checked={selected.includes(p.id)} onChange={e=>setSelected(e.target.checked?[...selected,p.id]:selected.filter(id=>id!==p.id))}/> {p.first_name} {p.last_name} — {p.city} — {p.primary_email}</label>)}
 <button className="button" disabled={busy || !selected.length} onClick={()=>action("draft")}>Préparer les {selected.length} brouillons — aucun envoi</button>
 <button className="button" disabled={busy} onClick={()=>action("prepare")}>Initialiser la campagne en brouillon</button>
 <button className="button" disabled={busy} onClick={()=>action("sync")}>Contrôler les réponses et les rebonds</button>
 {message?<p role="status">{message}</p>:null}</section>;
}
