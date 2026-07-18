import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionPlanBoard, type DoneTodayUiItem } from "@/components/action-plan/action-plan-board";
import { ActionPlanFilters } from "@/components/action-plan/action-plan-filters";
import { ACTION_PLAN_CATEGORY_LABELS, actionPlanSummary, groupActionPlanItems } from "@/features/action-plan/presentation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActionPlanForUser, listActionPlanDoneToday } from "@/repositories/action-plan";
import { listInteractionTypes } from "@/repositories/interactions";
import { getTenantContext } from "@/repositories/tenant-context";
import { listTaskOrganizationOptions } from "@/repositories/tasks";
import type { ActionPlanUiItem } from "@/features/action-plan/presentation";
import type { ActionPlanItem, Organization, Person, Relationship } from "@/types/domain";

type ActionPlanPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function valueOf(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatToday() {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date());
}

function firstNameFromUser(user: { user_metadata?: Record<string, unknown>; email?: string } | null) {
  const metadata = user?.user_metadata ?? {};
  const rawName = metadata.first_name ?? metadata.name ?? metadata.full_name ?? user?.email ?? "";
  const name = typeof rawName === "string" ? rawName.trim() : "";
  return name.split(/\s+/)[0] || "Atlas";
}

async function enrichActionPlanItems(items: ActionPlanItem[]): Promise<ActionPlanUiItem[]> {
  const supabase = await createSupabaseServerClient();
  const personIds = Array.from(new Set(items.map((item) => item.personId).filter((value): value is string => Boolean(value))));
  const organizationIds = Array.from(new Set(items.map((item) => item.organizationId).filter((value): value is string => Boolean(value))));
  const relationshipIds = Array.from(new Set(items.map((item) => item.relationshipId).filter((value): value is string => Boolean(value))));

  const [{ data: people }, { data: organizations }, { data: relationships }] = await Promise.all([
    personIds.length > 0 ? supabase.from("people").select("id, display_name").in("id", personIds) : Promise.resolve({ data: [] }),
    organizationIds.length > 0 ? supabase.from("organizations").select("id, name").in("id", organizationIds) : Promise.resolve({ data: [] }),
    relationshipIds.length > 0 ? supabase.from("relationships").select("id, person_id, organization_id").in("id", relationshipIds) : Promise.resolve({ data: [] })
  ]);

  const peopleById = new Map(((people ?? []) as Pick<Person, "id" | "display_name">[]).map((person) => [person.id, person.display_name]));
  const organizationsById = new Map(((organizations ?? []) as Pick<Organization, "id" | "name">[]).map((organization) => [organization.id, organization.name]));
  const relationshipsById = new Map(((relationships ?? []) as Pick<Relationship, "id" | "person_id" | "organization_id">[]).map((relationship) => [relationship.id, relationship]));

  return items.map((item) => {
    const relationship = item.relationshipId ? relationshipsById.get(item.relationshipId) : null;
    const personName = (relationship?.person_id ? peopleById.get(relationship.person_id) : null) ?? (item.personId ? peopleById.get(item.personId) : null);
    const organizationName = (relationship?.organization_id ? organizationsById.get(relationship.organization_id) : null) ?? (item.organizationId ? organizationsById.get(item.organizationId) : null);
    const entityName = [personName, organizationName].filter(Boolean).join(" - ") || organizationName || personName || "Contexte Atlas";
    return { ...item, entityName };
  });
}

export default async function ActionPlanPage({ searchParams }: ActionPlanPageProps) {
  const params = await searchParams;
  const context = await getTenantContext();
  if (!context) notFound();

  const organizations = await listTaskOrganizationOptions(context);
  const requestedOrganizationId = valueOf(params, "organizationId");
  const selectedOrganization = organizations.find((organization) => organization.id === requestedOrganizationId) ?? organizations[0] ?? null;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [rawItems, doneToday, interactionTypes] = selectedOrganization
    ? await Promise.all([
      getActionPlanForUser(context, { organizationId: selectedOrganization.id }),
      listActionPlanDoneToday(context, selectedOrganization.id),
      listInteractionTypes(context)
    ])
    : [[], [], []];
  const items = await enrichActionPlanItems(rawItems);
  const grouped = groupActionPlanItems(items);
  const counts = grouped.map((group) => ({ category: group.category, count: group.items.length }));
  const doneUi: DoneTodayUiItem[] = doneToday.map((item) => ({
    id: item.id,
    title: item.title,
    completedAt: item.completedAt,
    href: item.href,
    label: item.kind === "interaction" ? "Échange ajouté" : "Action terminée"
  }));

  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">Bonjour {firstNameFromUser(user)}</p>
          <p className="muted">{formatToday()}</p>
          <h1>Mon Plan d’action</h1>
          <p>{actionPlanSummary(items.length)}</p>
        </div>
        {selectedOrganization ? (
          <Link className="button subtle-button" href={`/organizations/${selectedOrganization.id}`}>Ouvrir l’organisation</Link>
        ) : null}
      </header>

      {counts.length > 0 ? (
        <nav className="action-plan-counters" aria-label="Catégories du Plan d’action">
          {counts.map((count) => (
            <a className="card action-plan-counter" href={`#${count.category}`} key={count.category}>
              <strong>{count.count}</strong>
              <span>{ACTION_PLAN_CATEGORY_LABELS[count.category]}</span>
            </a>
          ))}
        </nav>
      ) : null}

      <section className="card stack action-plan-context-card">
        <div className="page-header">
          <div>
            <h2>Organisation</h2>
            <p className="muted">Sélectionnez le contexte métier à prioriser.</p>
          </div>
        </div>
        {organizations.length === 0 ? (
          <p className="muted">Aucune organisation disponible pour ce tenant.</p>
        ) : (
          <ActionPlanFilters organizations={organizations} selectedOrganizationId={selectedOrganization?.id ?? ""} />
        )}
      </section>

      <section className="stack">
        <div className="action-plan-now-heading">
          <h2>À faire maintenant</h2>
          <span title="Atlas classe vos actions selon leur échéance, leur priorité et leur historique de report.">?</span>
        </div>
        <ActionPlanBoard initialItems={items} doneToday={doneUi} interactionTypes={interactionTypes} />
      </section>
    </div>
  );
}
