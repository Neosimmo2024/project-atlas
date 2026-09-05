import { paginateSearchResults, textMatchesSearch } from "@/features/people/search";
import {
  ownerLabel,
  isSignatureScheduled,
  type PipelineActionFilter,
  type PipelineCardModel,
  type PipelineContactFilter,
  type PipelineFilters,
  type PipelineRecontactFilter
} from "@/features/recruitment-pipeline/pipeline-ui";
import { RECRUITMENT_PIPELINE_STAGES } from "@/features/recruitment-pipeline/options";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Organization, Person, Relationship, RelationshipPipelineStage, TenantContext } from "@/types/domain";

export type PipelineOwnerOption = {
  id: string;
  label: string;
  role: string;
};

export type RecruitmentPipelineResult = {
  cards: PipelineCardModel[];
  owners: PipelineOwnerOption[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  invalidStages: string[];
};

type PipelinePerson = Pick<Person, "id" | "display_name" | "city" | "do_not_contact">;
type PipelineOrganization = Pick<Organization, "id" | "name" | "city" | "do_not_contact">;
type PipelineRelationshipRow = Relationship & {
  people?: PipelinePerson | null;
  organizations?: PipelineOrganization | null;
};
type PipelineRecruitmentSequence = {
  person_id: string;
  status: "pending" | "sent" | "error" | "stopped";
  lifecycle_status: "idle" | "scheduled" | "running" | "completed" | "stopped" | "error";
  current_step: number;
  next_action_at: string | null;
  stop_reason: string | null;
};

const emptyUuid = "00000000-0000-4000-8000-000000000000";

function pipelineRowMatchesSearch(row: PipelineRelationshipRow, query: string) {
  return textMatchesSearch([
    row.relationship_type,
    row.pipeline_stage,
    row.status,
    row.notes,
    row.people?.display_name,
    row.people?.city,
    row.organizations?.name,
    row.organizations?.city
  ], query);
}

async function contactScope(context: TenantContext, filter: PipelineContactFilter | "") {
  if (!filter) return { peopleIds: [] as string[], organizationIds: [] as string[] };
  const supabase = await createSupabaseServerClient();
  const [{ data: people, error: peopleError }, { data: organizations, error: organizationsError }] = await Promise.all([
    supabase.from("people").select("id").eq("tenant_id", context.tenantId).eq("do_not_contact", true).limit(1000),
    supabase.from("organizations").select("id").eq("tenant_id", context.tenantId).eq("do_not_contact", true).limit(1000)
  ]);
  if (peopleError) throw peopleError;
  if (organizationsError) throw organizationsError;
  return {
    peopleIds: (people ?? []).map((person) => person.id as string),
    organizationIds: (organizations ?? []).map((organization) => organization.id as string)
  };
}

export async function listPipelineOwners(context: TenantContext): Promise<PipelineOwnerOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_users")
    .select("user_id, roles(slug, label)")
    .eq("tenant_id", context.tenantId)
    .eq("status", "active")
    .order("user_id", { ascending: true })
    .limit(100);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const roleJoin = row.roles as { slug?: string; label?: string } | { slug?: string; label?: string }[] | null;
    const role = Array.isArray(roleJoin) ? roleJoin[0] : roleJoin;
    return {
      id: row.user_id as string,
      label: row.user_id === context.userId ? "Utilisateur courant" : `Utilisateur ${role?.label ?? "du tenant"}`,
      role: role?.slug ?? "member"
    };
  });
}

export async function listRecruitmentPipeline(context: TenantContext, filters: PipelineFilters): Promise<RecruitmentPipelineResult> {
  const supabase = await createSupabaseServerClient();
  const owners = await listPipelineOwners(context);
  const ownerNames = new Map(owners.map((owner) => [owner.id, owner.label]));
  const contact = await contactScope(context, filters.contact);
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let query = supabase
    .from("relationships")
    .select("*, people(id, display_name, city, do_not_contact), organizations(id, name, city, do_not_contact)", { count: "exact" })
    .eq("tenant_id", context.tenantId);

  if (filters.stage) query = query.eq("pipeline_stage", filters.stage);
  if (filters.ownerId) query = query.eq("owner_user_id", filters.ownerId);
  if (filters.noOwner) query = query.is("owner_user_id", null);
  if (filters.nextAction === "overdue") query = query.lt("next_action_at", startOfTodayIso());
  if (filters.nextAction === "today") query = query.gte("next_action_at", startOfTodayIso()).lt("next_action_at", startOfTomorrowIso());
  if (filters.nextAction === "none") query = query.is("next_action_at", null);
  if (filters.recontactable === "yes") query = query.contains("metadata", { recruitment_pipeline: { rejection: { recontactable: true } } });
  if (filters.recontactable === "no") query = query.contains("metadata", { recruitment_pipeline: { rejection: { recontactable: false } } });
  if (filters.contact === "blocked") {
    const peopleIds = contact.peopleIds.length > 0 ? contact.peopleIds : [emptyUuid];
    const organizationIds = contact.organizationIds.length > 0 ? contact.organizationIds : [emptyUuid];
    query = query.or(`person_id.in.(${peopleIds.join(",")}),organization_id.in.(${organizationIds.join(",")})`);
  }
  if (filters.contact === "allowed") {
    if (contact.peopleIds.length > 0) query = query.not("person_id", "in", `(${contact.peopleIds.join(",")})`);
    if (contact.organizationIds.length > 0) query = query.not("organization_id", "in", `(${contact.organizationIds.join(",")})`);
  }

  const orderedQuery = query
    .order("pipeline_stage", { ascending: true })
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true });

  const { data, error, count } = filters.query
    ? await orderedQuery
    : await orderedQuery.range(from, to);

  if (error) throw error;

  const rows = filters.query
    ? ((data ?? []) as PipelineRelationshipRow[]).filter((row) => pipelineRowMatchesSearch(row, filters.query))
    : (data ?? []) as PipelineRelationshipRow[];
  const invalidStages = rows
    .map((row) => row.pipeline_stage as string)
    .filter((stage) => !RECRUITMENT_PIPELINE_STAGES.includes(stage as RelationshipPipelineStage));

  const personIds = Array.from(new Set(rows.map((row) => row.person_id).filter((id): id is string => Boolean(id))));
  const sequenceByPerson = new Map<string, PipelineRecruitmentSequence>();
  if (personIds.length > 0) {
    const { data: sequences, error: sequenceError } = await supabase
      .from("recruitment_email_sequences")
      .select("person_id,status,lifecycle_status,current_step,next_action_at,stop_reason")
      .eq("tenant_id", context.tenantId)
      .in("person_id", personIds);
    if (sequenceError) throw sequenceError;
    for (const sequence of (sequences ?? []) as PipelineRecruitmentSequence[]) sequenceByPerson.set(sequence.person_id, sequence);
  }

  const allCards = rows
    .filter((row) => RECRUITMENT_PIPELINE_STAGES.includes(row.pipeline_stage))
    .map((row) => mapPipelineCard(row, ownerNames, row.person_id ? sequenceByPerson.get(row.person_id) ?? null : null));
  const paged = filters.query ? paginateSearchResults(allCards, filters.page, filters.pageSize) : { rows: allCards, total: count ?? allCards.length, pageCount: Math.max(1, Math.ceil((count ?? allCards.length) / filters.pageSize)) };
  const cards = paged.rows;
  const total = paged.total;

  return { cards, owners, total, page: filters.page, pageSize: filters.pageSize, pageCount: paged.pageCount, invalidStages };
}

function mapPipelineCard(row: PipelineRelationshipRow, ownerNames: Map<string, string>, sequence: PipelineRecruitmentSequence | null): PipelineCardModel {
  const sequenceSummary = recruitmentSequenceSummary(sequence);
  return {
    id: row.id,
    personName: row.people?.display_name ?? "Personne inconnue",
    organizationName: row.organizations?.name ?? "Organisation non renseignée",
    stage: row.pipeline_stage,
    ownerUserId: row.owner_user_id,
    ownerName: ownerLabel(row.owner_user_id, ownerNames),
    nextActionAt: row.next_action_at,
    lastInteractionAt: row.last_interaction_at,
    updatedAt: row.updated_at,
    doNotContact: Boolean(row.people?.do_not_contact || row.organizations?.do_not_contact),
    rejectionRecontactable: readRecontactable(row.metadata),
    signatureScheduled: row.pipeline_stage === "signature" && isSignatureScheduled(row.metadata),
    status: row.status,
    href: `/relationships/${row.id}`,
    recruitmentSequenceLabel: sequenceSummary.label,
    recruitmentSequenceTone: sequenceSummary.tone
  };
}

function recruitmentSequenceSummary(sequence: PipelineRecruitmentSequence | null): { label: string | null; tone: "neutral" | "info" | "warning" | "danger" } {
  if (!sequence) return { label: null, tone: "neutral" };
  if (sequence.lifecycle_status === "stopped") {
    if (sequence.stop_reason === "candidate_reply") return { label: "Réponse reçue · séquence arrêtée", tone: "info" };
    const reason = sequence.stop_reason === "contact_not_allowed" || sequence.stop_reason === "do_not_contact" ? "Ne pas contacter" : "Arrêtée";
    return { label: `Séquence arrêtée · ${reason}`, tone: "danger" };
  }
  if (sequence.lifecycle_status === "error" || sequence.status === "error") return { label: "Séquence email en erreur", tone: "danger" };
  if (sequence.lifecycle_status === "completed") return { label: "Séquence email terminée", tone: "neutral" };
  if (sequence.next_action_at) {
    const step = sequence.current_step === 1 ? "Relance J+3" : sequence.current_step === 2 ? "Relance J+7" : "Prochaine relance";
    return { label: `${step} prévue le ${formatSequenceDate(sequence.next_action_at)}`, tone: "info" };
  }
  if (sequence.status === "sent") return { label: "Email initial envoyé", tone: "info" };
  return { label: "Séquence email en cours", tone: "warning" };
}

function formatSequenceDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
}

function readRecontactable(metadata: Record<string, unknown>) {
  const pipeline = metadata.recruitment_pipeline;
  if (!pipeline || typeof pipeline !== "object") return null;
  const rejection = (pipeline as Record<string, unknown>).rejection;
  if (!rejection || typeof rejection !== "object") return null;
  const value = (rejection as Record<string, unknown>).recontactable;
  return typeof value === "boolean" ? value : null;
}

export function parsePipelineFilters(params: Record<string, string | string[] | undefined>): PipelineFilters {
  const value = (key: string) => {
    const raw = params[key];
    return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  };
  const stage = value("stage");
  const nextAction = value("nextAction");
  const contact = value("contact");
  const recontactable = value("recontactable");
  const page = Number.parseInt(value("page"), 10);
  const pageSize = Number.parseInt(value("pageSize"), 10);
  return {
    query: value("query").trim(),
    stage: RECRUITMENT_PIPELINE_STAGES.includes(stage as RelationshipPipelineStage) ? stage as RelationshipPipelineStage : "",
    ownerId: value("ownerId"),
    noOwner: value("noOwner") === "true",
    nextAction: ["overdue", "today", "none"].includes(nextAction) ? nextAction as PipelineActionFilter : "",
    contact: ["blocked", "allowed"].includes(contact) ? contact as PipelineContactFilter : "",
    recontactable: ["yes", "no"].includes(recontactable) ? recontactable as PipelineRecontactFilter : "",
    view: value("view") === "list" ? "list" : "kanban",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 25
  };
}

function startOfTodayIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

function startOfTomorrowIso() {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString();
}
