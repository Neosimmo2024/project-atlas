import type { ReactNode } from "react";

const LYON_MARKER = "[projet-lyon-neos-20261007]";
const headings: Record<string, string> = {
  "ANCIENNETÉ / PARCOURS": "Ancienneté et parcours",
  "ACTIVITÉ / VENTES / AVIS": "Biens, ventes et avis clients",
  "ÉQUIPE / RECRUTEMENT": "Équipe et recrutement",
  "RÉSEAUX SOCIAUX": "Réseaux sociaux",
  "IDENTITÉ JURIDIQUE": "Identité juridique",
  TVA: "TVA",
  "ANALYSE NEOS — HYPOTHÈSE À CONFIRMER": "Potentiel pour NEOS — à confirmer",
  "QUESTIONS SPÉCIFIQUES": "Questions à approfondir",
  "SOURCES CONSULTÉES / RAPPROCHÉES": "Sources de la recherche"
};

function linkedText(text: string): ReactNode {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    /^https?:\/\//.test(part)
      ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>{part}</a>
      : part
  );
}

/** Read-only presentation: the original comments remain available for editing. */
export function QualificationNotes({ comments }: { comments: string | null | undefined }) {
  if (!comments) return <p className="muted">Aucun commentaire.</p>;
  const markerIndex = comments.indexOf(LYON_MARKER);
  const imported = markerIndex >= 0 ? comments.slice(0, markerIndex).trim() : "";
  const research = markerIndex >= 0 ? comments.slice(markerIndex + LYON_MARKER.length).trim() : comments;
  const sections: { title: string; body: string[] }[] = [];
  for (const line of research.split(/\r?\n/)) {
    const title = Object.hasOwn(headings, line.trim()) ? headings[line.trim()] : undefined;
    if (title) sections.push({ title, body: [] });
    else {
      if (!sections.length) sections.push({ title: "Contexte de la recherche", body: [] });
      sections[sections.length - 1].body.push(line);
    }
  }
  const structured = sections.length > 1;
  return <div className="stack" style={{ minWidth: 0 }}>
    {structured ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "16px" }}>
      {sections.map((section, index) => <section key={index} style={{ border: "1px solid var(--border, #ddd)", borderRadius: "8px", padding: "16px", minWidth: 0, gridColumn: section.title === "Sources de la recherche" ? "1 / -1" : undefined }}>
        <h3 style={{ margin: "0 0 10px", fontSize: "1rem" }}>{section.title}</h3>
        <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6 }}>{linkedText(section.body.join("\n").trim())}</p>
      </section>)}
    </div> : <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6 }}>{linkedText(research)}</p>}
    {imported ? <details>
      <summary>Anciennes notes d’import et historique</summary>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.6 }}>{linkedText(imported)}</p>
    </details> : null}
  </div>;
}
