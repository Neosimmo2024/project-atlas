"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  formatPipelineDate,
  groupPipelineCards,
  isOverdue,
  isPipelineStage,
  isToday,
  PIPELINE_STAGE_LABELS,
  type PipelineCardModel,
  type PipelineFilters,
  type PipelineViewMode
} from "@/features/recruitment-pipeline/pipeline-ui";
import { ACTIVE_RECRUITMENT_PIPELINE_STAGES, RECRUITMENT_PIPELINE_STAGES, RECRUITMENT_REJECTION_REASON_LABELS, RECRUITMENT_REJECTION_REASONS } from "@/features/recruitment-pipeline/options";
import type { RelationshipPipelineStage, RelationshipRejectionReason, RoleSlug } from "@/types/domain";
import type { PipelineOwnerOption } from "@/repositories/recruitment-pipeline";
import { Badge, Button, EmptyState, ErrorState } from "@/components/ui";

type PipelinePageClientProps = {
  initialCards: PipelineCardModel[];
  owners: PipelineOwnerOption[];
  filters: PipelineFilters;
  role: RoleSlug;
  invalidStages: string[];
};

type DialogState =
  | { type: "stage"; card: PipelineCardModel; toStage?: RelationshipPipelineStage }
  | { type: "owner"; card: PipelineCardModel }
  | { type: "contact"; card: PipelineCardModel; doNotContact: boolean }
  | null;

type MutationResult = { kind: "success" | "error"; message: string } | null;

type RelationshipMutationResponse = {
  data?: {
    id: string;
    pipeline_stage: RelationshipPipelineStage;
    owner_user_id: string | null;
    next_action_at: string | null;
    last_interaction_at: string | null;
    updated_at: string;
    status: string;
  };
  error?: string;
};

const canManageOwner = new Set<RoleSlug>(["owner", "admin"]);
const canManagePipeline = new Set<RoleSlug>(["owner", "admin", "recruiter", "manager"]);

export function PipelinePageClient({ initialCards, owners, filters, role, invalidStages }: PipelinePageClientProps) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [view, setView] = useState<PipelineViewMode>(filters.view);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [result, setResult] = useState<MutationResult>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const grouped = useMemo(() => groupPipelineCards(cards), [cards]);
  const ownerNames = useMemo(() => new Map(owners.map((owner) => [owner.id, owner.label])), [owners]);

  useEffect(() => {
    if (view !== "kanban") return;
    const board = boardRef.current;
    if (!board) return;
    const mobileQuery = window.matchMedia("(max-width: 760px)");

    function scrollToFirstPopulatedColumn() {
      if (!mobileQuery.matches) return;
      const firstPopulatedColumn = grouped.find((column) => column.cards.length > 0);
      if (!firstPopulatedColumn) {
        board?.scrollTo({ left: 0, behavior: "auto" });
        return;
      }
      const columnElement = board?.querySelector<HTMLElement>(`[data-stage="${firstPopulatedColumn.stage}"]`);
      if (!columnElement) return;
      board?.scrollTo({ left: columnElement.offsetLeft - board.offsetLeft, behavior: "auto" });
    }

    scrollToFirstPopulatedColumn();
    window.addEventListener("resize", scrollToFirstPopulatedColumn);
    mobileQuery.addEventListener("change", scrollToFirstPopulatedColumn);
    return () => {
      window.removeEventListener("resize", scrollToFirstPopulatedColumn);
      mobileQuery.removeEventListener("change", scrollToFirstPopulatedColumn);
    };
  }, [grouped, view]);

  function openDialog(nextDialog: DialogState) {
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDialog(nextDialog);
  }

  function closeDialog() {
    setDialog(null);
    window.setTimeout(() => lastFocusedRef.current?.focus(), 0);
  }

  function setViewMode(nextView: PipelineViewMode) {
    const params = new URLSearchParams(window.location.search);
    params.set("view", nextView);
    setView(nextView);
    router.replace(`/pipeline?${params.toString()}`, { scroll: false });
  }

  if (invalidStages.length > 0) {
    return (
      <ErrorState
        title="Données de pipeline incohérentes"
        body="Une ou plusieurs relations utilisent une phase inconnue. Les transitions sont désactivées tant que les données ne sont pas corrigées."
      />
    );
  }

  return (
    <div className="stack">
      <div className="actions" role="toolbar" aria-label="Mode d'affichage du pipeline">
        <Button type="button" variant={view === "kanban" ? "primary" : "subtle"} onClick={() => setViewMode("kanban")}>Kanban</Button>
        <Button type="button" variant={view === "list" ? "primary" : "subtle"} onClick={() => setViewMode("list")}>Liste</Button>
      </div>

      {result ? <p className={result.kind === "success" ? "success" : "error"} role={result.kind === "error" ? "alert" : "status"}>{result.message}</p> : null}

      {cards.length === 0 ? (
        <EmptyState title="Aucune relation dans le pipeline" body="Aucune carte ne correspond aux filtres sélectionnés." />
      ) : view === "list" ? (
        <PipelineList cards={cards} owners={owners} role={role} openDialog={openDialog} loadingId={loadingId} />
      ) : (
        <div ref={boardRef} className="pipeline-board" aria-label="Kanban du pipeline de recrutement">
          {grouped.map((column) => (
            <section
              className="pipeline-column"
              data-has-cards={column.cards.length > 0 ? "true" : "false"}
              data-stage={column.stage}
              key={column.stage}
              aria-labelledby={`pipeline-column-${column.stage}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const relationshipId = event.dataTransfer.getData("text/relationship-id");
                const card = cards.find((item) => item.id === relationshipId);
                if (card && card.stage !== column.stage) openDialog({ type: "stage", card, toStage: column.stage });
              }}
            >
              <header className="pipeline-column-header">
                <h2 id={`pipeline-column-${column.stage}`}>{column.label}</h2>
                <Badge>{column.cards.length}</Badge>
              </header>
              {column.cards.length === 0 ? <p className="muted pipeline-column-empty">Aucune carte.</p> : column.cards.map((card) => (
                <PipelineCard key={card.id} card={card} role={role} loading={loadingId === card.id} openDialog={openDialog} />
              ))}
            </section>
          ))}
        </div>
      )}

      <PipelineDialog
        dialog={dialog}
        owners={owners}
        ownerNames={ownerNames}
        onClose={closeDialog}
        onMutating={(id) => setLoadingId(id)}
        onDone={(updated, message) => {
          setCards((current) => current.map((card) => card.id === updated.id ? updated : card));
          setResult({ kind: "success", message });
          setLoadingId(null);
          closeDialog();
          router.refresh();
        }}
        onError={(message) => {
          setResult({ kind: "error", message });
          setLoadingId(null);
        }}
      />
    </div>
  );
}

function PipelineCard({ card, role, loading, openDialog }: { card: PipelineCardModel; role: RoleSlug; loading: boolean; openDialog: (dialog: DialogState) => void }) {
  const canEditPipeline = canManagePipeline.has(role);
  return (
    <article
      className="card pipeline-card"
      draggable={canEditPipeline}
      onDragStart={(event) => event.dataTransfer.setData("text/relationship-id", card.id)}
    >
      <div className="pipeline-card-heading">
        <div>
          <p className="muted">{PIPELINE_STAGE_LABELS[card.stage]}</p>
          <h3><Link href={card.href}>{card.personName}</Link></h3>
        </div>
        {card.doNotContact ? <Badge tone="danger">Ne plus contacter</Badge> : null}
      </div>
      <p className="pipeline-card-organization">{card.organizationName}</p>
      <div className="pipeline-card-meta" aria-label={`Synthèse de ${card.personName}`}>
        <div className="pipeline-meta-row">
          <span className="pipeline-meta-label">Responsable</span>
          <Badge tone={card.ownerUserId ? "neutral" : "warning"}>{card.ownerName}</Badge>
        </div>
        <div className="pipeline-meta-row">
          <span className="pipeline-meta-label">Prochaine action</span>
          {card.nextActionAt ? <Badge tone={isOverdue(card.nextActionAt) ? "danger" : isToday(card.nextActionAt) ? "info" : "neutral"}>{formatPipelineDate(card.nextActionAt)}</Badge> : <Badge tone="warning">Sans prochaine action</Badge>}
        </div>
        {card.lastInteractionAt ? (
          <div className="pipeline-meta-row">
            <span className="pipeline-meta-label">Dernière activité</span>
            <Badge>{formatPipelineDate(card.lastInteractionAt)}</Badge>
          </div>
        ) : null}
        <div className="tag-list pipeline-card-tags">
          {card.signatureScheduled ? <Badge tone="info">Signature programmée</Badge> : null}
          {card.rejectionRecontactable === true ? <Badge tone="info">Refus recontactable</Badge> : null}
        </div>
      </div>
      <div className="actions pipeline-card-actions">
        <Link className="button subtle-button" href={card.href}>Ouvrir</Link>
        <Button type="button" variant="subtle" disabled={loading || !canEditPipeline} onClick={() => openDialog({ type: "stage", card })}>Changer de phase</Button>
        <Button type="button" variant="subtle" disabled={loading || !canManageOwner.has(role)} onClick={() => openDialog({ type: "owner", card })}>Responsable</Button>
        <Button type="button" variant="subtle" disabled={loading || !canEditPipeline} onClick={() => openDialog({ type: "contact", card, doNotContact: !card.doNotContact })}>
          {card.doNotContact ? "Lever le blocage" : "Ne plus contacter"}
        </Button>
      </div>
    </article>
  );
}

function PipelineList({ cards, owners, role, openDialog, loadingId }: { cards: PipelineCardModel[]; owners: PipelineOwnerOption[]; role: RoleSlug; openDialog: (dialog: DialogState) => void; loadingId: string | null }) {
  return (
    <>
    <div className="data-table pipeline-table">
      <div className="table-head">
        <span>Personne</span><span>Organisation</span><span>Phase</span><span>Responsable</span><span>Prochaine action</span><span>Dernière activité</span><span>Contact</span><span>Actions</span>
      </div>
      {cards.map((card) => (
        <div className="table-row" key={card.id}>
          <span><Link href={card.href}>{card.personName}</Link></span>
          <span>{card.organizationName}</span>
          <span>{PIPELINE_STAGE_LABELS[card.stage]}</span>
          <span>{card.ownerName}</span>
          <span>{formatPipelineDate(card.nextActionAt)}</span>
          <span>{formatPipelineDate(card.lastInteractionAt)}</span>
          <span>{card.doNotContact ? "Ne plus contacter" : "Autorisé"}</span>
          <span className="actions">
            <Button type="button" variant="subtle" disabled={loadingId === card.id || !canManagePipeline.has(role)} onClick={() => openDialog({ type: "stage", card })}>Phase</Button>
            <Button type="button" variant="subtle" disabled={loadingId === card.id || owners.length === 0 || !canManageOwner.has(role)} onClick={() => openDialog({ type: "owner", card })}>Responsable</Button>
          </span>
        </div>
      ))}
    </div>
    <PipelineListCards cards={cards} owners={owners} role={role} openDialog={openDialog} loadingId={loadingId} />
    </>
  );
}

function PipelineListCards({ cards, owners, role, openDialog, loadingId }: { cards: PipelineCardModel[]; owners: PipelineOwnerOption[]; role: RoleSlug; openDialog: (dialog: DialogState) => void; loadingId: string | null }) {
  return (
    <div className="pipeline-list-cards" aria-label="Liste mobile du pipeline">
      {cards.map((card) => (
        <article className="card pipeline-list-card" key={card.id}>
          <div className="pipeline-card-heading">
            <div>
              <p className="muted">{PIPELINE_STAGE_LABELS[card.stage]}</p>
              <h3><Link href={card.href}>{card.personName}</Link></h3>
            </div>
            {card.doNotContact ? <Badge tone="danger">Ne plus contacter</Badge> : null}
          </div>
          <p className="pipeline-card-organization">{card.organizationName}</p>
          <div className="pipeline-card-meta" aria-label={`Synthèse de ${card.personName}`}>
            <div className="pipeline-meta-row">
              <span className="pipeline-meta-label">Responsable</span>
              <Badge tone={card.ownerUserId ? "neutral" : "warning"}>{card.ownerName}</Badge>
            </div>
            <div className="pipeline-meta-row">
              <span className="pipeline-meta-label">Prochaine action</span>
              {card.nextActionAt ? <Badge tone={isOverdue(card.nextActionAt) ? "danger" : isToday(card.nextActionAt) ? "info" : "neutral"}>{formatPipelineDate(card.nextActionAt)}</Badge> : <Badge tone="warning">Sans prochaine action</Badge>}
            </div>
            <div className="pipeline-meta-row">
              <span className="pipeline-meta-label">Dernière activité</span>
              <Badge>{formatPipelineDate(card.lastInteractionAt)}</Badge>
            </div>
          </div>
          <div className="actions pipeline-card-actions">
            <Link className="button subtle-button" href={card.href}>Ouvrir</Link>
            <Button type="button" variant="subtle" disabled={loadingId === card.id || !canManagePipeline.has(role)} onClick={() => openDialog({ type: "stage", card })}>Phase</Button>
            <Button type="button" variant="subtle" disabled={loadingId === card.id || owners.length === 0 || !canManageOwner.has(role)} onClick={() => openDialog({ type: "owner", card })}>Responsable</Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function PipelineDialog({
  dialog,
  owners,
  ownerNames,
  onClose,
  onMutating,
  onDone,
  onError
}: {
  dialog: DialogState;
  owners: PipelineOwnerOption[];
  ownerNames: Map<string, string>;
  onClose: () => void;
  onMutating: (id: string) => void;
  onDone: (card: PipelineCardModel, message: string) => void;
  onError: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const firstField = dialogRef.current?.querySelector<HTMLElement>("select, textarea, input, button");
    firstField?.focus();
  }, [dialog]);

  if (!dialog) return null;
  const title = dialog.type === "stage" ? "Changer la phase" : dialog.type === "owner" ? "Modifier le responsable" : dialog.doNotContact ? "Activer Ne plus contacter" : "Lever Ne plus contacter";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const form = new FormData(event.currentTarget);
    onMutating(dialog.card.id);
    try {
      const updated = dialog.type === "stage"
        ? await submitStage(dialog.card, form, ownerNames)
        : dialog.type === "owner"
          ? await submitOwner(dialog.card, form, ownerNames)
          : await submitContact(dialog.card, form, dialog.doNotContact, ownerNames);
      onDone(updated, dialog.type === "stage" ? "Phase mise à jour." : dialog.type === "owner" ? "Responsable mis à jour." : "Préférence de contact mise à jour.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Action impossible.");
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="card stack confirm-dialog pipeline-dialog" role="dialog" aria-modal="true" aria-labelledby="pipeline-dialog-title">
        <h2 id="pipeline-dialog-title">{title}</h2>
        <p className="muted">{dialog.card.personName} - {dialog.card.organizationName}</p>
        <form className="form" onSubmit={submit}>
          {dialog.type === "stage" ? <StageFields card={dialog.card} toStage={dialog.toStage} /> : null}
          {dialog.type === "owner" ? (
            <label>Responsable
              <select className="input" name="ownerUserId" defaultValue={dialog.card.ownerUserId ?? ""}>
                <option value="">Sans responsable</option>
                {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
              </select>
            </label>
          ) : null}
          {dialog.type === "contact" ? (
            <>
              <p className="warning">{dialog.doNotContact ? "Cette action bloque les actions de contact. Une réouverture future ne lèvera pas automatiquement ce blocage." : "La levée du blocage exige une justification et reste historisée."}</p>
              <label>Justification<textarea className="input textarea" name="justification" required /></label>
            </>
          ) : null}
          <div className="actions pipeline-dialog-actions">
            <Button type="submit">Valider</Button>
            <Button type="button" variant="subtle" onClick={onClose}>Annuler</Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function StageFields({ card, toStage }: { card: PipelineCardModel; toStage?: RelationshipPipelineStage }) {
  const stageOptions = card.stage === "rejected" ? ACTIVE_RECRUITMENT_PIPELINE_STAGES : RECRUITMENT_PIPELINE_STAGES;
  const defaultStage = card.stage === "rejected" ? (toStage && toStage !== "rejected" ? toStage : "qualification") : toStage ?? card.stage;
  const [selectedStage, setSelectedStage] = useState<RelationshipPipelineStage>(defaultStage);
  const isSignature = selectedStage === "signature";
  const isRejected = selectedStage === "rejected";
  const isLeavingSignature = card.stage === "signature" && selectedStage !== "signature";
  const isReopen = card.stage === "rejected" && selectedStage !== "rejected";
  return (
    <>
      <label>Phase cible
        <select className="input" name="toStage" value={selectedStage} onChange={(event) => setSelectedStage(event.target.value as RelationshipPipelineStage)}>
          {stageOptions.map((stage) => <option key={stage} value={stage}>{PIPELINE_STAGE_LABELS[stage]}</option>)}
        </select>
      </label>
      {isReopen ? <p className="warning">L&apos;ancien refus restera dans l&apos;historique. Le blocage de contact ne sera pas levé automatiquement.</p> : null}
      <label>Motif ou note<textarea className="input textarea" name="reason" required={isReopen || isSignature || isLeavingSignature} /></label>
      {isLeavingSignature ? <label className="checks"><input type="checkbox" name="confirmed" value="true" required /> Confirmation explicite</label> : null}
      {isSignature ? (
        <div className="form-grid">
          <label className="checks"><input type="checkbox" name="confirmed" value="true" required /> Confirmation explicite</label>
          <label>Date de signature<input className="input" type="datetime-local" name="signatureAt" required /></label>
          <label>Date de démarrage<input className="input" type="datetime-local" name="startAt" /></label>
        </div>
      ) : null}
      {isRejected ? (
        <>
          <label>Motif de refus
            <select className="input" name="rejectionReason" defaultValue="" required>
              <option value="">Sélectionner</option>
              {RECRUITMENT_REJECTION_REASONS.map((reason) => <option key={reason} value={reason}>{RECRUITMENT_REJECTION_REASON_LABELS[reason]}</option>)}
            </select>
          </label>
          <label>Commentaire de refus<textarea className="input textarea" name="rejectionComment" /></label>
          <div className="form-grid">
            <label className="checks"><input type="checkbox" name="rejectionRecontactable" value="true" /> Refus recontactable</label>
            <label className="checks"><input type="checkbox" name="doNotContact" value="true" /> Ne plus contacter</label>
            <label>Date de relance<input className="input" type="datetime-local" name="rejectionFollowUpAt" /></label>
          </div>
        </>
      ) : null}
      <p className="muted">Le serveur vérifie la transition, le tenant et l&apos;horodatage attendu avant enregistrement.</p>
    </>
  );
}

async function submitStage(card: PipelineCardModel, form: FormData, ownerNames: Map<string, string>) {
  const toStage = String(form.get("toStage") ?? "");
  if (!isPipelineStage(toStage)) throw new Error("Phase cible invalide.");
  const doNotContact = form.get("doNotContact") === "true" ? true : null;
  const signatureAt = localDateValue(form.get("signatureAt"));
  return requestMutation(card, `/api/relationships/${card.id}/pipeline`, {
    toStage,
    expectedStage: card.stage,
    expectedUpdatedAt: card.updatedAt,
    confirmed: form.get("confirmed") === "true",
    reason: String(form.get("reason") ?? "").trim() || null,
    signatureAt,
    startAt: localDateValue(form.get("startAt")),
    rejectionReason: valueOrUndefined(form.get("rejectionReason")) as RelationshipRejectionReason | undefined,
    rejectionComment: String(form.get("rejectionComment") ?? "").trim() || null,
    rejectionRecontactable: form.get("rejectionRecontactable") === "true",
    rejectionFollowUpAt: localDateValue(form.get("rejectionFollowUpAt")),
    doNotContact,
    metadata: {}
  }, ownerNames, {
    ...(doNotContact === true ? { doNotContact: true } : {}),
    ...(toStage === "signature" ? { signatureScheduled: Boolean(signatureAt && new Date(signatureAt).getTime() > Date.now()) } : {})
  });
}

async function submitOwner(card: PipelineCardModel, form: FormData, ownerNames: Map<string, string>) {
  return requestMutation(card, `/api/relationships/${card.id}/owner`, {
    ownerUserId: String(form.get("ownerUserId") || "") || null,
    expectedUpdatedAt: card.updatedAt,
    reason: "Réattribution depuis le pipeline"
  }, ownerNames);
}

async function submitContact(card: PipelineCardModel, form: FormData, doNotContact: boolean, ownerNames: Map<string, string>) {
  return requestMutation(card, `/api/relationships/${card.id}/do-not-contact`, {
    doNotContact,
    justification: String(form.get("justification") ?? "").trim(),
    expectedUpdatedAt: card.updatedAt
  }, ownerNames, { doNotContact });
}

async function requestMutation(card: PipelineCardModel, url: string, body: Record<string, unknown>, ownerNames: Map<string, string>, overrides: Partial<PipelineCardModel> = {}) {
  const response = await fetch(url, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await readJson(response);
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "Action refusée par le serveur.");
  return {
    ...card,
    ...overrides,
    stage: payload.data.pipeline_stage,
    ownerUserId: payload.data.owner_user_id,
    ownerName: payload.data.owner_user_id ? ownerNames.get(payload.data.owner_user_id) ?? "Responsable assigné" : "Sans responsable",
    nextActionAt: payload.data.next_action_at,
    lastInteractionAt: payload.data.last_interaction_at,
    updatedAt: payload.data.updated_at,
    status: payload.data.status
  } satisfies PipelineCardModel;
}

async function readJson(response: Response): Promise<RelationshipMutationResponse> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as RelationshipMutationResponse;
  } catch {
    return { error: text };
  }
}

function localDateValue(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return text ? new Date(text).toISOString() : null;
}

function valueOrUndefined(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return text || undefined;
}
