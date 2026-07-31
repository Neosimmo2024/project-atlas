import { ApiError } from "@/lib/api-errors";
import {
  validateCsvImportDecisions,
  type CsvImportDecision,
  type CsvImportNormalizedValues,
  type CsvImportPreparedDecision,
  type CsvImportPreviewResult,
  type CsvImportRowPreview
} from "./csv-import";
import type { OrganizationVatStatus } from "@/types/domain";

export type CsvImportExecutionRequest = {
  content: string;
  mapping: Record<string, string>;
  decisions: CsvImportPreparedDecision[];
  analysisFingerprint: string;
  idempotencyKey: string;
  sourceName?: string | null;
  addToPipeline?: boolean;
  confirm: boolean;
};

export type CsvImportExecutionRow = {
  lineNumber: number;
  decision: CsvImportDecision;
  classification: CsvImportRowPreview["classification"];
  normalizedValues: CsvImportNormalizedValues;
  targetPersonId: string | null;
  targetOrganizationId: string | null;
};

export type CsvImportExecutionSummary = {
  totalRows: number;
  createNew: number;
  linkExisting: number;
  ignored: number;
  reviewLater: number;
  rejected: number;
  organizationsToCreate: number;
  relationshipsToCreate: number;
};

export type CsvImportExecutionReport = {
  id: string;
  idempotent: boolean;
  sourceName: string | null;
  analysisFingerprint: string;
  summary: {
    totalRows: number;
    peopleCreated: number;
    peopleLinked: number;
    organizationsCreated: number;
    organizationsLinked: number;
    relationshipsCreated: number;
    relationshipsLinked: number;
    relationshipsSkipped: number;
    pipelineIntegrationEnabled: boolean;
    rowsIgnored: number;
    rowsReviewLater: number;
    rowsRejected: number;
    errorsCount: number;
  };
  rows: Array<{
    lineNumber: number;
    decision: CsvImportDecision;
    outcome: string;
    personId?: string | null;
    organizationId?: string | null;
    personCreated?: boolean;
    organizationCreated?: boolean;
    vatStatus?: OrganizationVatStatus | null;
    relationshipId?: string | null;
    relationshipCreated?: boolean;
    relationshipLinked?: boolean;
    relationshipOutcome?: string | null;
    relationshipReason?: string | null;
  }>;
  errors: string[];
  createdAt: string;
};

const executableDecisions = new Set<CsvImportDecision>(["create_new", "link_existing", "ignore_row", "review_later"]);

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function targetsFor(row: CsvImportRowPreview) {
  return {
    personIds: unique([row.existingPersonId, ...row.duplicatePersonIds, ...row.possibleDuplicatePersonIds]),
    organizationIds: unique([...row.duplicateOrganizationIds, ...row.possibleDuplicateOrganizationIds])
  };
}

export function summarizeCsvImportExecution(preview: CsvImportPreviewResult, decisions: CsvImportPreparedDecision[], addToPipeline = false): CsvImportExecutionSummary {
  const rows = buildCsvImportExecutionRows(preview, decisions, preview.analysisFingerprint);
  const executableRows = rows.filter((row) => row.decision === "create_new" || row.decision === "link_existing");

  return {
    totalRows: rows.length,
    createNew: rows.filter((row) => row.decision === "create_new").length,
    linkExisting: rows.filter((row) => row.decision === "link_existing").length,
    ignored: rows.filter((row) => row.decision === "ignore_row").length,
    reviewLater: rows.filter((row) => row.decision === "review_later").length,
    rejected: preview.rows.filter((row) => row.classification === "rejected_row").length,
    organizationsToCreate: rows.filter((row) => row.decision === "create_new" && typeof row.normalizedValues.organization === "string" && row.normalizedValues.organization.trim() !== "" && !row.targetOrganizationId).length,
    relationshipsToCreate: addToPipeline ? executableRows.filter((row) => typeof row.normalizedValues.organization === "string" && row.normalizedValues.organization.trim() !== "").length : 0
  };
}

export function buildCsvImportExecutionRows(preview: CsvImportPreviewResult, decisions: CsvImportPreparedDecision[], analysisFingerprint: string): CsvImportExecutionRow[] {
  const validation = validateCsvImportDecisions(preview, decisions, analysisFingerprint);
  if (!validation.valid) {
    throw new ApiError(validation.errors.join(" "), 400, "CSV_IMPORT_DECISION_VALIDATION_FAILED");
  }

  const decisionsByLine = new Map(decisions.map((decision) => [decision.lineNumber, decision]));

  return preview.rows.map((row) => {
    const prepared = decisionsByLine.get(row.lineNumber);
    const decision = prepared?.decision || row.recommendedDecision;
    if (!executableDecisions.has(decision)) {
      throw new ApiError(`Ligne ${row.lineNumber}: decision d'import invalide.`, 400, "CSV_IMPORT_INVALID_DECISION");
    }

    const targets = targetsFor(row);
    let targetPersonId = prepared?.targetPersonId ?? null;
    let targetOrganizationId = prepared?.targetOrganizationId ?? null;

    if (decision === "link_existing") {
      if (!targetPersonId && targets.personIds.length === 1) targetPersonId = targets.personIds[0];
      if (!targetOrganizationId && targets.organizationIds.length === 1) targetOrganizationId = targets.organizationIds[0];
      if (targetPersonId && !targets.personIds.includes(targetPersonId)) {
        throw new ApiError(`Ligne ${row.lineNumber}: la personne cible n'est pas accessible dans cette analyse.`, 400, "CSV_IMPORT_INVALID_PERSON_TARGET");
      }
      if (targetOrganizationId && !targets.organizationIds.includes(targetOrganizationId)) {
        throw new ApiError(`Ligne ${row.lineNumber}: l'organisation cible n'est pas accessible dans cette analyse.`, 400, "CSV_IMPORT_INVALID_ORGANIZATION_TARGET");
      }
    }

    if (decision === "create_new" && (row.classification === "critical_conflict" || row.classification === "rejected_row")) {
      throw new ApiError(`Ligne ${row.lineNumber}: cette ligne ne peut pas etre creee automatiquement.`, 400, "CSV_IMPORT_BLOCKED_ROW");
    }

    return {
      lineNumber: row.lineNumber,
      decision,
      classification: row.classification,
      normalizedValues: row.normalizedValues,
      targetPersonId,
      targetOrganizationId
    };
  });
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanFrom(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function nullableStringFrom(value: unknown) {
  return typeof value === "string" ? value : null;
}

function rowReportFrom(value: unknown): CsvImportExecutionReport["rows"][number] | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const decision = record.decision;
  if (decision !== "create_new" && decision !== "link_existing" && decision !== "ignore_row" && decision !== "review_later") return null;
  return {
    lineNumber: numberFrom(record.lineNumber),
    decision,
    outcome: stringFrom(record.outcome),
    personId: nullableStringFrom(record.personId),
    organizationId: nullableStringFrom(record.organizationId),
    personCreated: booleanFrom(record.personCreated),
    organizationCreated: booleanFrom(record.organizationCreated),
    vatStatus: nullableVatStatusFrom(record.vatStatus),
    relationshipId: nullableStringFrom(record.relationshipId),
    relationshipCreated: booleanFrom(record.relationshipCreated),
    relationshipLinked: booleanFrom(record.relationshipLinked),
    relationshipOutcome: nullableStringFrom(record.relationshipOutcome),
    relationshipReason: nullableStringFrom(record.relationshipReason)
  };
}

function nullableVatStatusFrom(value: unknown): OrganizationVatStatus | null {
  return value === "assujetti" || value === "non_assujetti" || value === "a_verifier" ? value : null;
}

export function parseCsvImportExecutionReport(value: Record<string, unknown>): CsvImportExecutionReport {
  const summary = typeof value.summary === "object" && value.summary !== null ? value.summary as Record<string, unknown> : {};
  const rows = Array.isArray(value.rows) ? value.rows.map(rowReportFrom).filter((row): row is CsvImportExecutionReport["rows"][number] => row !== null) : [];
  const errors = Array.isArray(value.errors) ? value.errors.filter((item): item is string => typeof item === "string") : [];

  return {
    id: stringFrom(value.id),
    idempotent: booleanFrom(value.idempotent),
    sourceName: nullableStringFrom(value.sourceName),
    analysisFingerprint: stringFrom(value.analysisFingerprint),
    summary: {
      totalRows: numberFrom(summary.totalRows),
      peopleCreated: numberFrom(summary.peopleCreated),
      peopleLinked: numberFrom(summary.peopleLinked),
      organizationsCreated: numberFrom(summary.organizationsCreated),
      organizationsLinked: numberFrom(summary.organizationsLinked),
      relationshipsCreated: numberFrom(summary.relationshipsCreated),
      relationshipsLinked: numberFrom(summary.relationshipsLinked),
      relationshipsSkipped: numberFrom(summary.relationshipsSkipped),
      pipelineIntegrationEnabled: booleanFrom(summary.pipelineIntegrationEnabled),
      rowsIgnored: numberFrom(summary.rowsIgnored),
      rowsReviewLater: numberFrom(summary.rowsReviewLater),
      rowsRejected: numberFrom(summary.rowsRejected),
      errorsCount: numberFrom(summary.errorsCount)
    },
    rows,
    errors,
    createdAt: stringFrom(value.createdAt)
  };
}
