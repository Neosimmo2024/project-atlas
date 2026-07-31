import type { CsvImportCancellationStatus, CsvImportRunStatus } from "@/types/domain";

export type CsvImportHistoryRow = {
  id: string;
  sourceName: string | null;
  requestedBy: string;
  requestedByLabel: string;
  status: CsvImportRunStatus;
  cancellationStatus: CsvImportCancellationStatus | null;
  totalRows: number;
  peopleCreated: number;
  peopleLinked: number;
  organizationsCreated: number;
  organizationsLinked: number;
  relationshipsCreated: number;
  rowsIgnored: number;
  rowsReviewLater: number;
  rowsRejected: number;
  createdAt: string;
};

export type CsvImportCancellationEntity = {
  id: string;
  label: string;
  deletable: boolean;
  reason: string | null;
};

export type CsvImportCancellationEligibilityStatus =
  | "cancellable"
  | "partially_cancellable"
  | "already_cancelled"
  | "cancellation_in_progress"
  | "not_cancellable"
  | "cancellation_failed"
  | "no_action_needed";

export type CsvImportCancellationEligibility = {
  importId: string;
  status: CsvImportCancellationEligibilityStatus;
  traceInsufficient: boolean;
  people: CsvImportCancellationEntity[];
  organizations: CsvImportCancellationEntity[];
  relationships: CsvImportCancellationEntity[];
  summary: {
    deletable: number;
    kept: number;
    peopleCreated: number;
    organizationsCreated: number;
    relationshipsCreated: number;
  };
  cancellation: Record<string, unknown> | null;
};

export type CsvImportCancellationReport = {
  id: string;
  importId: string;
  idempotent: boolean;
  status: CsvImportCancellationStatus;
  summary: {
    peopleDeleted: number;
    peopleKept: number;
    organizationsDeleted: number;
    organizationsKept: number;
    relationshipsDeleted: number;
    relationshipsKept: number;
  };
  peopleDeleted: CsvImportCancellationEntity[];
  peopleKept: CsvImportCancellationEntity[];
  organizationsDeleted: CsvImportCancellationEntity[];
  organizationsKept: CsvImportCancellationEntity[];
  relationshipsDeleted: CsvImportCancellationEntity[];
  relationshipsKept: CsvImportCancellationEntity[];
  executedAt: string;
};

export const csvImportCancellationStatusLabels: Record<CsvImportCancellationEligibilityStatus | CsvImportCancellationStatus, string> = {
  cancellable: "Annulable",
  partially_cancellable: "Partiellement annulable",
  already_cancelled: "Deja annule",
  cancellation_in_progress: "Annulation en cours",
  not_cancellable: "Non annulable",
  cancellation_failed: "Échec d'annulation",
  no_action_needed: "Aucune suppression necessaire",
  processing: "Annulation en cours",
  complete: "Annulation complete",
  partial: "Annulation partielle",
  none: "Aucune suppression necessaire",
  failed: "Echec"
};

export const csvImportCancellationReasonLabels: Record<string, string> = {
  deja_absente: "déjà absente",
  appartient_a_un_autre_tenant: "appartient a un autre tenant",
  modifiee_apres_import: "modifiée après l'import",
  dependance_relationship: "utilisée par une relation",
  dependance_task: "utilisée par une tâche",
  dependance_interaction: "utilisée par une interaction",
  dependance_project: "utilisée par un projet",
  dependance_timeline: "utilisée par la chronologie",
  dependance_organisation_enfant: "utilisée comme organisation parente",
  dependance_action_plan: "utilisée par le plan d'action",
  dependance_pipeline_event: "utilisée par un événement Pipeline",
  relation_preexistante: "relation déjà existante avant l'import",
  relation_type_different: "relation d'un autre type déjà présente",
  phase_modifiee_apres_import: "phase modifiée après l'import",
  statut_modifie_apres_import: "statut modifie apres l'import",
  responsable_modifie: "responsable modifie apres l'import",
  trace_contradictoire: "trace contradictoire",
  utilisee_par_un_autre_import: "utilisée par un autre import",
  tracabilite_insuffisante: "tracabilite insuffisante",
  suppression_interdite: "suppression interdite"
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function parseEntity(value: unknown): CsvImportCancellationEntity | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (!id) return null;
  return {
    id,
    label: asString(record.label) || id,
    deletable: asBoolean(record.deletable),
    reason: asNullableString(record.reason)
  };
}

function parseEntities(value: unknown) {
  return Array.isArray(value) ? value.map(parseEntity).filter((item): item is CsvImportCancellationEntity => item !== null) : [];
}

export function parseCsvImportCancellationEligibility(value: unknown): CsvImportCancellationEligibility {
  const record = asRecord(value);
  const summary = asRecord(record.summary);
  const status = asString(record.status) as CsvImportCancellationEligibilityStatus;

  return {
    importId: asString(record.importId),
    status,
    traceInsufficient: asBoolean(record.traceInsufficient),
    people: parseEntities(record.people),
    organizations: parseEntities(record.organizations),
    relationships: parseEntities(record.relationships),
    summary: {
      deletable: asNumber(summary.deletable),
      kept: asNumber(summary.kept),
      peopleCreated: asNumber(summary.peopleCreated),
      organizationsCreated: asNumber(summary.organizationsCreated),
      relationshipsCreated: asNumber(summary.relationshipsCreated)
    },
    cancellation: typeof record.cancellation === "object" && record.cancellation !== null ? record.cancellation as Record<string, unknown> : null
  };
}

export function parseCsvImportCancellationReport(value: unknown): CsvImportCancellationReport {
  const record = asRecord(value);
  const summary = asRecord(record.summary);

  return {
    id: asString(record.id),
    importId: asString(record.importId),
    idempotent: asBoolean(record.idempotent),
    status: asString(record.status) as CsvImportCancellationStatus,
    summary: {
      peopleDeleted: asNumber(summary.peopleDeleted),
      peopleKept: asNumber(summary.peopleKept),
      organizationsDeleted: asNumber(summary.organizationsDeleted),
      organizationsKept: asNumber(summary.organizationsKept),
      relationshipsDeleted: asNumber(summary.relationshipsDeleted),
      relationshipsKept: asNumber(summary.relationshipsKept)
    },
    peopleDeleted: parseEntities(record.peopleDeleted),
    peopleKept: parseEntities(record.peopleKept),
    organizationsDeleted: parseEntities(record.organizationsDeleted),
    organizationsKept: parseEntities(record.organizationsKept),
    relationshipsDeleted: parseEntities(record.relationshipsDeleted),
    relationshipsKept: parseEntities(record.relationshipsKept),
    executedAt: asString(record.executedAt)
  };
}
