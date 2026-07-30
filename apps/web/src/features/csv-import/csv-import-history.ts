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
  summary: {
    deletable: number;
    kept: number;
    peopleCreated: number;
    organizationsCreated: number;
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
  };
  peopleDeleted: CsvImportCancellationEntity[];
  peopleKept: CsvImportCancellationEntity[];
  organizationsDeleted: CsvImportCancellationEntity[];
  organizationsKept: CsvImportCancellationEntity[];
  executedAt: string;
};

export const csvImportCancellationStatusLabels: Record<CsvImportCancellationEligibilityStatus | CsvImportCancellationStatus, string> = {
  cancellable: "Annulable",
  partially_cancellable: "Partiellement annulable",
  already_cancelled: "Deja annule",
  cancellation_in_progress: "Annulation en cours",
  not_cancellable: "Non annulable",
  cancellation_failed: "Echec d'annulation",
  no_action_needed: "Aucune suppression necessaire",
  processing: "Annulation en cours",
  complete: "Annulation complete",
  partial: "Annulation partielle",
  none: "Aucune suppression necessaire",
  failed: "Echec"
};

export const csvImportCancellationReasonLabels: Record<string, string> = {
  deja_absente: "deja absente",
  appartient_a_un_autre_tenant: "appartient a un autre tenant",
  modifiee_apres_import: "modifiee apres l'import",
  dependance_relationship: "utilisee par une relation",
  dependance_task: "utilisee par une tache",
  dependance_interaction: "utilisee par une interaction",
  dependance_project: "utilisee par un projet",
  dependance_timeline: "utilisee par la chronologie",
  dependance_organisation_enfant: "utilisee comme organisation parente",
  dependance_action_plan: "utilisee par le plan d'action",
  utilisee_par_un_autre_import: "utilisee par un autre import",
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
    summary: {
      deletable: asNumber(summary.deletable),
      kept: asNumber(summary.kept),
      peopleCreated: asNumber(summary.peopleCreated),
      organizationsCreated: asNumber(summary.organizationsCreated)
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
      organizationsKept: asNumber(summary.organizationsKept)
    },
    peopleDeleted: parseEntities(record.peopleDeleted),
    peopleKept: parseEntities(record.peopleKept),
    organizationsDeleted: parseEntities(record.organizationsDeleted),
    organizationsKept: parseEntities(record.organizationsKept),
    executedAt: asString(record.executedAt)
  };
}
