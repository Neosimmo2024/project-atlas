"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import {
  ACTION_PLAN_CATEGORY_DESCRIPTIONS,
  ACTION_PLAN_CATEGORY_LABELS,
  ACTION_PLAN_SOURCE_LABELS,
  actionPlanItemHref,
  actionPlanItemLinkLabel,
  actionPlanReasonLabel,
  formatActionPlanDate
} from "@/features/action-plan/action-plan-ui";
import type { ActionPlanCategory, ActionPlanItem } from "@/types/domain";
import type { ActionPlanOrganizationOption } from "@/repositories/action-plan";

const CATEGORY_ORDER: ActionPlanCategory[] = ["critical", "priority", "opportunity", "to_schedule"];

type ActionPlanPageClientProps = {
  organizations: ActionPlanOrganizationOption[];
  initialOrganizationId?: string;
};

export function ActionPlanPageClient({ organizations, initialOrganizationId = "" }: ActionPlanPageClientProps) {
  const router = useRouter();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(() => {
    return organizations.some((organization) => organization.id === initialOrganizationId) ? initialOrganizationId : "";
  });
  const [items, setItems] = useState<ActionPlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const selectedOrganization = useMemo(() => {
    return organizations.find((organization) => organization.id === selectedOrganizationId) ?? null;
  }, [organizations, selectedOrganizationId]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/action-plan?organizationId=${encodeURIComponent(selectedOrganizationId)}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { data?: ActionPlanItem[]; error?: string } | null;
        if (!response.ok) throw new Error(body?.error ?? "Impossible de charger le Plan d’action.");
        setItems(body?.data ?? []);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") return;
        setItems([]);
        setError("Le Plan d’action n’a pas pu être chargé. Veuillez réessayer.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedOrganizationId, reloadToken]);

  function handleOrganizationChange(value: string) {
    setSelectedOrganizationId(value);
    const href = value ? `/action-plan?organizationId=${encodeURIComponent(value)}` : "/action-plan";
    router.replace(href, { scroll: false });
  }

  const groupedItems = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: items.filter((item) => item.category === category)
    }));
  }, [items]);

  if (organizations.length === 0) {
    return (
      <EmptyState
        title="Aucune organisation disponible"
        body="Créez ou importez d’abord une organisation pour consulter son Plan d’action."
      />
    );
  }

  return (
    <section className="action-plan-layout" aria-label="Plan d’action par organisation">
      <Card className="action-plan-selector">
        <div>
          <h2>Organisation</h2>
          <p>Sélectionnez une organisation pour afficher uniquement ses recommandations calculées.</p>
        </div>
        <label className="action-plan-select-label">
          Organisation
          <select
            className="input action-plan-select"
            value={selectedOrganizationId}
            onChange={(event) => handleOrganizationChange(event.target.value)}
          >
            <option value="">Sélectionner une organisation</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </label>
      </Card>

      {!selectedOrganizationId ? (
        <EmptyState
          title="Sélectionnez une organisation"
          body="Le Plan d’action est calculé organisation par organisation afin de conserver un contexte clair."
        />
      ) : null}

      {selectedOrganization ? (
        <div className="action-plan-context" aria-live="polite">
          <span className="muted">Organisation sélectionnée</span>
          <strong>{selectedOrganization.name}</strong>
          <Badge tone="info">Lecture seule</Badge>
        </div>
      ) : null}

      {loading ? <LoadingState label="Chargement du Plan d’action..." /> : null}
      {error ? (
        <ErrorState
          title="Impossible de charger le Plan d’action."
          body={error}
          action={<Button type="button" onClick={() => setReloadToken((value) => value + 1)}>Réessayer</Button>}
        />
      ) : null}

      {!loading && !error && selectedOrganizationId && items.length === 0 ? (
        <EmptyState
          title="Aucune recommandation"
          body="Aucune action prioritaire n’est calculée pour cette organisation pour le moment."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="action-plan-results">
          {groupedItems.map(({ category, items: categoryItems }) => (
            <section key={category} className="action-plan-category" aria-labelledby={`action-plan-${category}`}>
              <div className="action-plan-category-heading">
                <div>
                  <h2 id={`action-plan-${category}`}>{ACTION_PLAN_CATEGORY_LABELS[category]}</h2>
                  <p>{ACTION_PLAN_CATEGORY_DESCRIPTIONS[category]}</p>
                </div>
                <Badge tone={categoryItems.length > 0 ? "info" : "neutral"}>{categoryItems.length} recommandation(s)</Badge>
              </div>
              {categoryItems.length === 0 ? (
                <p className="muted action-plan-empty-category">Aucune carte dans cette catégorie.</p>
              ) : (
                <div className="action-plan-card-list">
                  {categoryItems.map((item) => <ActionPlanCard key={item.id} item={item} />)}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ActionPlanCard({ item }: { item: ActionPlanItem }) {
  const href = actionPlanItemHref(item);
  const dueDate = formatActionPlanDate(item.dueAt);

  return (
    <Card as="article" className="action-plan-card">
      <div className="action-plan-card-header">
        <div>
          <p className="muted">{ACTION_PLAN_SOURCE_LABELS[item.sourceType]}</p>
          <h3>{item.title}</h3>
        </div>
        <Badge tone={item.category === "critical" ? "danger" : item.category === "priority" ? "warning" : "neutral"}>
          Score {item.score}
        </Badge>
      </div>
      {item.description ? <p>{item.description}</p> : null}
      <dl className="action-plan-card-meta">
        <div>
          <dt>Échéance</dt>
          <dd>{dueDate ?? "Non définie"}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{ACTION_PLAN_SOURCE_LABELS[item.sourceType]}</dd>
        </div>
      </dl>
      <div className="action-plan-reasons">
        <h4>Pourquoi cette recommandation ?</h4>
        <ul>
          {item.reasons.map((reason) => (
            <li key={`${item.id}-${reason.code}`}>{actionPlanReasonLabel(reason)}</li>
          ))}
        </ul>
      </div>
      {href ? (
        <div className="actions">
          <Link className="button subtle-button link-button" href={href}>{actionPlanItemLinkLabel(item)}</Link>
        </div>
      ) : null}
    </Card>
  );
}
