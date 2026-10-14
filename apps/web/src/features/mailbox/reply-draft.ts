/** Conservative draft suggestions: no external AI subscription or invented commitments. */
export function incomingReplyText(text: string) {
  return text.split(/\n(?:Le .{5,200}(?:écrit|ecrit)|On .{5,200}wrote|De\s*:|From\s*:|_{5,}|-{5,})/i)[0]
    .split(/\n>/)[0].trim().slice(0, 4000);
}

export function suggestReply(text: string) {
  const incoming = incomingReplyText(text);
  const normalized = incoming.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let body: string;
  if (/pas interesse|ne suis pas interesse|ne me contactez|ne plus.{0,20}(contacter|recevoir)|retir.{0,20}(liste|fichier)|desinscri/.test(normalized)) {
    body = "Merci pour votre retour. Je prends note de votre souhait et mets fin à cette démarche de recrutement.\n\nJe vous souhaite une bonne continuation.";
  } else if (/commission|remuneration|pourcentage|retrocession/.test(normalized)) {
    body = "Merci pour votre retour et votre question sur la rémunération. Chez NEOS IMMO, la rémunération sur vos ventes va de 75 % à 100 % de la commission, selon les paliers et les conditions applicables.\n\nJe vous propose un échange pour détailler ces conditions et voir si notre fonctionnement correspond à votre projet : https://calendly.com/renato-ponzio/30min";
  } else if (/plus tard|pas pour le moment|pas actuellement|pas maintenant/.test(normalized)) {
    body = "Merci pour votre retour. Je comprends que ce ne soit pas le bon moment pour vous.\n\nSouhaitez-vous que nous reprenions contact plus tard ? Si oui, dites-moi à quelle période cela vous conviendrait.";
  } else if (/rendez.vous|disponib|echang|appel|telephone|interesse/.test(normalized)) {
    body = "Merci pour votre retour. Je vous propose d’échanger sur votre activité et votre projet, ainsi que sur le développement de NEOS IMMO à Lyon et dans sa métropole.\n\nVous pouvez choisir un créneau ici : https://calendly.com/renato-ponzio/30min\n\nSi vous préférez, indiquez-moi vos disponibilités.";
  } else {
    body = "Merci pour votre retour. J’ai bien pris connaissance de votre message.\n\nJe vous propose d’en discuter directement pour répondre précisément à vos questions et voir si notre projet de développement sur Lyon peut vous correspondre : https://calendly.com/renato-ponzio/30min";
  }
  return `Bonjour,\n\n${body}\n\nBien à vous,\nRenato Ponzio\nPrésident NEOS IMMO`;
}

export function escapedReplyHtml(text: string) {
  return `<div style="white-space:pre-wrap;font-family:Arial,sans-serif">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")}</div>`;
}
