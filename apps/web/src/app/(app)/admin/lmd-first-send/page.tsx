"use client";
import { useEffect,useState } from "react";
type Item={interactionId:string;displayName:string;recipientEmail:string;subject:string;body:string};
export default function LmdPage(){
 const [batch,setBatch]=useState("A"),[items,setItems]=useState<Item[]>([]),[busy,setBusy]=useState(false),[status,setStatus]=useState("Chargement...");
 async function load(group:string){const response=await fetch("/api/admin/lmd-remaining?batch="+group,{cache:"no-store"});const body=await response.json();if(!response.ok){setStatus(body.error);return [] as Item[];}setItems(body.data);setStatus(group+" : "+body.confirmed+"/"+body.total+" opérations confirmées ; "+body.data.length+" contacts à traiter.");return body.data as Item[];}
 useEffect(()=>{void load(batch);},[batch]);
 async function run(){if(busy)return;setBusy(true);let completed=0;
 try {const remaining=await load(batch);for(const item of remaining){setStatus("Programmation"+" : "+completed+"/"+remaining.length+" — "+item.displayName);
 const r=await fetch("/api/admin/lmd-single-send",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({interactionId:item.interactionId})});const body=await r.json();if(!r.ok){setStatus("Arrêt après "+completed+" opérations confirmées : "+body.error+(body.messageId?" — "+body.messageId:""));return;}completed++;}
 await load(batch);
 }catch{setStatus("Confirmation indisponible. Vérifier l’historique avant toute reprise.");}finally{setBusy(false);}
 }
 return <main style={{maxWidth:1000,margin:"40px auto",padding:24}}><h1>Campagne LMD — NEOS IMMO</h1><p>Expéditeur : Renato Ponzio / renato.ponzio@neos-immo.com. Message et signature préparés dans Atlas.</p><p>Groupe A : programmation des contacts restants pour le 8 octobre 2026 à 9 h 15. Groupe B : programmation chez Brevo pour le 8 octobre 2026 à 9 h 30, heure de Paris.</p><button disabled={busy} onClick={()=>setBatch("A")}>Groupe A</button> <button disabled={busy} onClick={()=>setBatch("B")}>Groupe B</button><p role="status">{status}</p><button disabled={busy||items.length===0} onClick={()=>void run()}>{batch==="B"?"Programmer les contacts restants chez Brevo":"Programmer les contacts restants du groupe A"}</button>{items.map(i=><section key={i.interactionId} style={{border:"1px solid #ddd",marginTop:12,padding:12}}><strong>{i.displayName}</strong><div>{i.recipientEmail}</div><div>{i.subject}</div><details><summary>Voir le message préparé</summary><pre style={{whiteSpace:"pre-wrap"}}>{i.body}</pre></details></section>)}</main>;
}
