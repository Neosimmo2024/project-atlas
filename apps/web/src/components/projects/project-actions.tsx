"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_LOSS_REASON_LABELS, PROJECT_STAGE_LABELS } from "@/features/projects/options";
import { Button } from "@/components/ui/button";
import type { Project, ProjectLossReason, ProjectStage } from "@/types/domain";

type ActionState = "stage" | "win" | "lose" | "reopen" | "archive" | "reactivate" | null;

const stages = Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[];
const lossReasons = Object.keys(PROJECT_LOSS_REASON_LABELS) as ProjectLossReason[];

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function todayLocal() {
  return new Date().toISOString().slice(0, 10);
}

export function ProjectActions({ project }: { project: Project }) {
  const router = useRouter();
  const [active, setActive] = useState<ActionState>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isClosed = project.status === "won" || project.status === "lost";
  const isArchived = Boolean(project.archived_at);

  async function request(endpoint: string, payload: Record<string, unknown> = {}, method = "POST", success: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await readResponseBody(response);
      if (!response.ok) {
        setError(result.error ?? "Action impossible.");
        return;
      }
      setActive(null);
      router.push(`/projects/${project.id}?toast=${encodeURIComponent(success)}`);
      router.refresh();
    } catch {
      setError("Erreur reseau pendant l'action.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="actions">
        {!isArchived ? <Button type="button" onClick={() => setActive("stage")} disabled={isClosed}>Changer etape</Button> : null}
        {!isArchived && !isClosed ? <Button type="button" onClick={() => setActive("win")}>Marquer comme gagne</Button> : null}
        {!isArchived && !isClosed ? <Button type="button" onClick={() => setActive("lose")}>Marquer comme perdu</Button> : null}
        {isClosed ? <Button type="button" onClick={() => setActive("reopen")}>Reouvrir</Button> : null}
        {!isArchived ? <Button type="button" className="subtle-button" onClick={() => setActive("archive")}>Archiver</Button> : <Button type="button" onClick={() => setActive("reactivate")}>Reactiver</Button>}
      </div>
      {isClosed ? <p className="muted">Rouvrez le Projet avant de modifier son etape.</p> : null}

      {active === "stage" ? (
        <form className="card stack" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void request(`/api/projects/${project.id}`, { stage: String(data.get("stage") ?? "") }, "PATCH", "Etape mise a jour.");
        }}>
          <h2>Changer etape du Projet</h2>
          <label>
            Etape
            <select className="input" name="stage" defaultValue={project.stage}>
              {stages.map((stage) => <option key={stage} value={stage}>{PROJECT_STAGE_LABELS[stage]}</option>)}
            </select>
          </label>
          <div className="actions"><Button disabled={loading}>Valider</Button><Button type="button" className="subtle-button" onClick={() => setActive(null)}>Annuler</Button></div>
        </form>
      ) : null}

      {active === "win" ? (
        <form className="card stack" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void request(`/api/projects/${project.id}/win`, { finalValue: String(data.get("finalValue") ?? ""), wonAt: String(data.get("wonAt") ?? ""), note: String(data.get("note") ?? "") }, "POST", "Projet marque comme gagne.");
        }}>
          <h2>Marquer ce Projet comme gagne</h2>
          <div className="form-grid">
            <label>Valeur finale<input className="input" name="finalValue" inputMode="decimal" defaultValue={project.estimated_value ?? ""} /></label>
            <label>Date de gain<input className="input" name="wonAt" type="date" defaultValue={todayLocal()} /></label>
          </div>
          <label>Note<textarea className="input textarea" name="note" /></label>
          <div className="actions"><Button disabled={loading}>Confirmer le gain</Button><Button type="button" className="subtle-button" onClick={() => setActive(null)}>Annuler</Button></div>
        </form>
      ) : null}

      {active === "lose" ? (
        <form className="card stack" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void request(`/api/projects/${project.id}/lose`, { lossReason: String(data.get("lossReason") ?? ""), lostAt: String(data.get("lostAt") ?? ""), note: String(data.get("note") ?? "") }, "POST", "Projet marque comme perdu.");
        }}>
          <h2>Marquer ce Projet comme perdu</h2>
          <div className="form-grid">
            <label>
              Motif
              <select className="input" name="lossReason" required>
                {lossReasons.map((reason) => <option key={reason} value={reason}>{PROJECT_LOSS_REASON_LABELS[reason]}</option>)}
              </select>
            </label>
            <label>Date de perte<input className="input" name="lostAt" type="date" defaultValue={todayLocal()} /></label>
          </div>
          <label>Note<textarea className="input textarea" name="note" /></label>
          <div className="actions"><Button disabled={loading}>Confirmer la perte</Button><Button type="button" className="subtle-button" onClick={() => setActive(null)}>Annuler</Button></div>
        </form>
      ) : null}

      {active === "reopen" ? <Confirm title="Reouvrir ce Projet ?" body="Le Projet repassera au statut Ouvert. Son historique, ses taches et ses echanges seront conserves." loading={loading} confirm="Reouvrir" cancel={() => setActive(null)} action={() => request(`/api/projects/${project.id}/reopen`, {}, "POST", "Projet rouvert.")} /> : null}
      {active === "archive" ? <Confirm title="Archiver ce Projet ?" body="Il disparaitra de la liste active, mais ses donnees seront conservees." loading={loading} confirm="Archiver" cancel={() => setActive(null)} action={() => request(`/api/projects/${project.id}/archive`, {}, "POST", "Projet archive.")} /> : null}
      {active === "reactivate" ? <Confirm title="Reactiver ce Projet ?" body="Le Projet reviendra dans la liste active." loading={loading} confirm="Reactiver" cancel={() => setActive(null)} action={() => request(`/api/projects/${project.id}/reactivate`, {}, "POST", "Projet reactive.")} /> : null}
    </div>
  );
}

function Confirm({ title, body, confirm, loading, cancel, action }: { title: string; body: string; confirm: string; loading: boolean; cancel: () => void; action: () => void }) {
  return (
    <div className="card stack" role="dialog" aria-modal="true" aria-labelledby="project-confirm-title">
      <h2 id="project-confirm-title">{title}</h2>
      <p>{body}</p>
      <div className="actions">
        <Button type="button" disabled={loading} onClick={action}>{loading ? "Traitement..." : confirm}</Button>
        <Button type="button" className="subtle-button" onClick={cancel}>Annuler</Button>
      </div>
    </div>
  );
}
