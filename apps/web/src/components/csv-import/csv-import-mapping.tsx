"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import {
  CSV_IMPORT_FIELD_DEFINITIONS,
  CSV_IMPORT_FIELD_GROUP_LABELS,
  validateCsvImportMapping
} from "@/features/csv-import/csv-import-mapping";
import {
  validateCsvImportDecisions,
  type CsvImportDecision,
  type CsvImportMapping,
  type CsvImportMappingValue,
  type CsvImportPreparedDecision,
  type CsvImportPreviewResult,
  type CsvImportRowPreview
} from "@/features/csv-import/csv-import";
import {
  summarizeCsvImportExecution,
  type CsvImportExecutionReport
} from "@/features/csv-import/csv-import-execution";

type Step = "upload" | "mapping" | "review" | "ready" | "report";

type PreviewApiResponse = {
  data?: CsvImportPreviewResult;
  error?: string;
  message?: string;
};

type ExecuteApiResponse = {
  data?: CsvImportExecutionReport;
  error?: string;
  message?: string;
};

const decisionLabels: Record<CsvImportDecision | "", string> = {
  "": "Decision a prendre",
  create_new: "Considerer comme nouvelle entree",
  link_existing: "Rattacher a l'enregistrement Atlas",
  ignore_row: "Ignorer la ligne",
  review_later: "Conserver a examiner"
};

async function parsePreviewResponse(response: Response) {
  const body = await response.json().catch(() => null) as PreviewApiResponse | null;
  if (!response.ok || !body?.data) {
    throw new Error(body?.error || body?.message || "Le fichier n'a pas pu etre analyse.");
  }
  return body.data;
}

async function parseExecuteResponse(response: Response) {
  const body = await response.json().catch(() => null) as ExecuteApiResponse | null;
  if (!response.ok || !body?.data) {
    throw new Error(body?.error || body?.message || "L'import n'a pas pu être exécuté.");
  }
  return body.data;
}

function rowStatusLabel(row: CsvImportRowPreview) {
  if (row.classification === "new_contact") return row.organizationMatches.length > 0 ? "Sans doublon personne, organisation à confirmer" : "Sans doublon détecté";
  if (row.classification === "existing_contact_enrichment") return "Correspondance Atlas";
  if (row.classification === "certain_duplicate") return "Doublon détecté";
  if (row.classification === "possible_duplicate") return "Cas ambigu";
  if (row.classification === "critical_conflict") return "Conflit critique";
  return "Ligne invalide";
}

function defaultDecisions(preview: CsvImportPreviewResult) {
  return Object.fromEntries(preview.rows.map((row) => [
    row.lineNumber,
    row.decisionRequired ? "" : row.recommendedDecision
  ])) as Record<number, CsvImportDecision | "">;
}

export function CsvImportMapping() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<CsvImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<CsvImportMapping>({});
  const [decisions, setDecisions] = useState<Record<number, CsvImportDecision | "">>({});
  const [addToPipeline, setAddToPipeline] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [report, setReport] = useState<CsvImportExecutionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = useMemo(
    () => preview ? validateCsvImportMapping(preview.headers, mapping) : { valid: false, errors: [] },
    [mapping, preview]
  );
  const preparedDecisions = useMemo<CsvImportPreparedDecision[]>(
    () => Object.entries(decisions).map(([lineNumber, decision]) => {
      const row = preview?.rows.find((item) => item.lineNumber === Number(lineNumber));
      const personTargets = row ? [row.existingPersonId, ...row.duplicatePersonIds, ...row.possibleDuplicatePersonIds].filter(Boolean) : [];
      const organizationTargets = row ? [...row.duplicateOrganizationIds, ...row.possibleDuplicateOrganizationIds].filter(Boolean) : [];
      const uniquePersonTargets = [...new Set(personTargets)] as string[];
      const uniqueOrganizationTargets = [...new Set(organizationTargets)];

      return {
        lineNumber: Number(lineNumber),
        decision,
        targetPersonId: decision === "link_existing" && uniquePersonTargets.length === 1 ? uniquePersonTargets[0] : null,
        targetOrganizationId: decision === "link_existing" && uniqueOrganizationTargets.length === 1 ? uniqueOrganizationTargets[0] : null
      };
    }),
    [decisions, preview]
  );
  const decisionValidation = useMemo(
    () => preview ? validateCsvImportDecisions(preview, preparedDecisions, preview.analysisFingerprint) : { valid: false, errors: [], pendingDecisions: 0 },
    [preparedDecisions, preview]
  );
  const executionSummary = useMemo(
    () => preview && decisionValidation.valid ? summarizeCsvImportExecution(preview, preparedDecisions, addToPipeline) : null,
    [addToPipeline, decisionValidation.valid, preparedDecisions, preview]
  );

  async function requestPreview(csvContent: string, nextMapping?: CsvImportMapping) {
    const response = await fetch("/api/imports/csv/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextMapping ? { content: csvContent, mapping: nextMapping } : { content: csvContent })
    });
    return parsePreviewResponse(response);
  }

  async function selectFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Selectionnez un fichier CSV.");
      }
      const fileContent = await file.text();
      const result = await requestPreview(fileContent);
      setFileName(file.name);
      setContent(fileContent);
      setPreview(result);
      setMapping(result.proposedMapping);
      setDecisions(defaultDecisions(result));
      setIdempotencyKey(crypto.randomUUID());
      setReport(null);
      setStep("mapping");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le fichier n'a pas pu etre analyse.");
    } finally {
      setLoading(false);
    }
  }

  function updateMapping(header: string, value: CsvImportMappingValue) {
    setMapping((current) => ({ ...current, [header]: value }));
    if (step === "review" || step === "ready") setStep("mapping");
  }

  async function validateMapping() {
    if (!validation.valid || !content) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestPreview(content, mapping);
      setPreview(result);
      setMapping(result.proposedMapping);
      setDecisions(defaultDecisions(result));
      setReport(null);
      setStep("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La verification n'a pas pu etre recalculee.");
    } finally {
      setLoading(false);
    }
  }

  function updateDecision(lineNumber: number, decision: CsvImportDecision | "") {
    setDecisions((current) => ({ ...current, [lineNumber]: decision }));
    if (step === "ready") setStep("review");
  }

  function continueToNextStep() {
    if (!decisionValidation.valid) return;
    setStep("ready");
  }

  async function executeImport() {
    if (!preview || !content || !decisionValidation.valid || !idempotencyKey) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/imports/csv/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          mapping,
          decisions: preparedDecisions,
          analysisFingerprint: preview.analysisFingerprint,
          idempotencyKey,
          sourceName: fileName,
          addToPipeline,
          confirm: true
        })
      });
      const result = await parseExecuteResponse(response);
      setReport(result);
      setStep("report");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L'import n'a pas pu être exécuté.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("upload");
    setFileName("");
    setContent("");
    setPreview(null);
    setMapping({});
    setDecisions({});
    setAddToPipeline(false);
    setIdempotencyKey("");
    setReport(null);
    setError(null);
  }

  return (
    <div className="stack">
      <ol className="import-steps" aria-label="Etapes de l'import">
        <li className={step !== "upload" ? "done" : "active"}>1. Previsualisation</li>
        <li className={step === "review" || step === "ready" || step === "report" ? "done" : step === "mapping" ? "active" : ""}>2. Correspondance</li>
        <li className={step === "review" ? "active" : step === "ready" || step === "report" ? "done" : ""}>3. Vérification des données</li>
        <li className={step === "ready" ? "active" : step === "report" ? "done" : ""}>4. Execution</li>
      </ol>

      {step === "upload" ? (
        <section className="card import-upload">
          <div>
            <h2>Choisir le fichier a preparer</h2>
            <p>Le fichier est lu pour afficher ses colonnes. Aucune donnée n&apos;est créée dans Atlas.</p>
          </div>
          <label className="button link-button import-file-button">
            {loading ? "Lecture en cours..." : "Selectionner un CSV"}
            <input
              accept=".csv,text/csv"
              disabled={loading}
              onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </section>
      ) : null}

      {preview && step !== "upload" ? (
        <>
          <section className="card import-file-summary">
            <div>
              <p className="muted">Fichier sélectionné</p>
              <h2>{fileName}</h2>
            </div>
            <div>
              <strong>{preview.rows.length}</strong>
              <span> ligne(s)</span>
            </div>
            <div>
              <strong>{preview.headers.length}</strong>
              <span> colonne(s)</span>
            </div>
          </section>

          {step === "mapping" ? (
            <>
              <section className="stack">
                <header>
                  <h2>Associez les colonnes aux champs Atlas</h2>
                  <p className="muted">Les suggestions sont modifiables. Choisissez &quot;Ignorer cette colonne&quot; si elle ne doit pas etre reprise.</p>
                </header>

                <div className="import-mapping-list">
                  {preview.headers.map((header) => {
                    const samples = preview.rows
                      .map((row) => row.originalValues[header]?.trim())
                      .filter(Boolean)
                      .slice(0, 3);

                    return (
                      <article className="card import-mapping-row" key={header}>
                        <div>
                          <p className="muted">Colonne du fichier</p>
                          <h3>{header}</h3>
                          <p className="import-samples">
                            {samples.length > 0 ? samples.join(" - ") : "Aucune valeur d'exemple"}
                          </p>
                        </div>
                        <label>
                          Champ Atlas
                          <select
                            className="input"
                            onChange={(event) => updateMapping(header, event.target.value as CsvImportMappingValue)}
                            value={mapping[header] ?? "ignore"}
                          >
                            <option value="ignore">Ignorer cette colonne</option>
                            {(["person", "professional", "recruitment"] as const).map((group) => (
                              <optgroup key={group} label={CSV_IMPORT_FIELD_GROUP_LABELS[group]}>
                                {CSV_IMPORT_FIELD_DEFINITIONS.filter((definition) => definition.group === group).map((definition) => (
                                  <option key={definition.field} value={definition.field}>{definition.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                      </article>
                    );
                  })}
                </div>
              </section>

              {!validation.valid ? (
                <section className="import-validation-errors" aria-live="polite">
                  <strong>Correspondance a completer</strong>
                  <ul>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ) : null}
            </>
          ) : null}

          {step === "review" || step === "ready" || step === "report" ? (
            <section className="stack">
              <header>
                <h2>Vérification et doublons détectés</h2>
                <p className="muted">Les valeurs originales restent visibles. Les valeurs normalisees servent uniquement a la comparaison.</p>
              </header>

              <div className="grid import-review-summary">
                <Metric label="Lignes analysees" value={preview.summary.totalRows} />
                <Metric label="Sans correspondance" value={preview.summary.cleanRows} />
                <Metric label="Doublons fichier" value={preview.summary.internalDuplicates} />
                <Metric label="Correspondances Atlas" value={preview.summary.atlasMatches} />
                <Metric label="Cas ambigus" value={preview.summary.ambiguousRows} />
                <Metric label="Decisions restantes" value={decisionValidation.pendingDecisions} />
              </div>

              <div className="import-review-list">
                {preview.rows.map((row) => (
                  <article className="card import-review-row" key={row.lineNumber}>
                    <div className="import-review-heading">
                      <div>
                        <p className="muted">Ligne {row.lineNumber}</p>
                        <h3>{rowStatusLabel(row)}</h3>
                        <p>{row.reason}</p>
                      </div>
                      <label>
                        Decision preparee
                        <select
                          className="input"
                          disabled={step === "report"}
                          onChange={(event) => updateDecision(row.lineNumber, event.target.value as CsvImportDecision | "")}
                          value={decisions[row.lineNumber] ?? ""}
                        >
                          {Object.entries(decisionLabels).map(([value, label]) => (
                            <option key={value || "empty"} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="import-review-values">
                      <div>
                        <strong>Valeurs originales</strong>
                        <dl>{Object.entries(row.originalValues).map(([key, value]) => value.trim() ? <div key={key}><dt>{key}</dt><dd>{value}</dd></div> : null)}</dl>
                      </div>
                      <div>
                        <strong>Valeurs normalisees</strong>
                        <dl>{Object.entries(row.normalizedValues).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
                      </div>
                    </div>

                    {[...row.matches, ...row.organizationMatches].length > 0 ? (
                      <div className="import-match-list">
                        <strong>Rapprochements détectés</strong>
                        {[...row.matches, ...row.organizationMatches].map((match, index) => (
                          <div className="import-match" key={`${row.lineNumber}-${match.entityType}-${match.entityId ?? match.lineNumber}-${index}`}>
                            <p>{match.explanation}</p>
                            <span>{match.kind === "internal_duplicate" ? `Fichier, ligne ${match.lineNumber}` : `Atlas: ${match.entityId}`}</span>
                            <span>Champs: {match.fields.join(", ")}</span>
                            {match.differences.length > 0 ? <span>Differences: {match.differences.join(" | ")}</span> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {row.warnings.length > 0 ? <ul className="import-warning-list">{row.warnings.map((item) => <li key={item}>{item}</li>)}</ul> : null}
                    {row.errors.length > 0 ? <ul className="error-list">{row.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
                  </article>
                ))}
              </div>

              {!decisionValidation.valid ? (
                <section className="import-validation-errors" aria-live="polite">
                  <strong>Decisions a completer</strong>
                  <ul>{decisionValidation.errors.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ) : null}

              <section className="card import-pipeline-option">
                <label className="confirm-check">
                  <input
                    checked={addToPipeline}
                    disabled={step === "report"}
                    onChange={(event) => {
                      setAddToPipeline(event.target.checked);
                      if (step === "ready") setStep("review");
                    }}
                    type="checkbox"
                  />
                  Ajouter les contacts éligibles au pipeline de recrutement
                </label>
                <p className="muted">
                  Option globale: Atlas créera uniquement des relations de recrutement prudentes en phase détection lorsque la personne et l&apos;organisation sont identifiées. Les lignes sans organisation ou ambiguës resteront sans entrée Pipeline.
                </p>
              </section>
            </section>
          ) : null}

          {step === "ready" ? (
            <section className="card import-confirmation" role="status">
              <div>
                <strong>Import prêt à exécuter</strong>
                <p>Atlas recalculera la verification cote serveur avant toute ecriture. L&apos;execution est transactionnelle et protegee contre le double clic.</p>
              </div>
              {executionSummary ? (
                <div className="grid import-review-summary">
                  <Metric label="Personnes à créer" value={executionSummary.createNew} />
                  <Metric label="Rattachements existants" value={executionSummary.linkExisting} />
                  <Metric label="Organisations à créer" value={executionSummary.organizationsToCreate} />
                  <Metric label="A examiner plus tard" value={executionSummary.reviewLater} />
                  <Metric label="Lignes ignorees" value={executionSummary.ignored} />
                  <Metric label="Relations créées" value={executionSummary.relationshipsToCreate} />
                </div>
              ) : null}
              <p className="muted">
                Pipeline: {addToPipeline ? "les contacts éligibles seront ajoutés en phase détection." : "aucune relation de recrutement ne sera créée."}
              </p>
            </section>
          ) : null}

          {step === "report" && report ? (
            <section className="card import-final-report" role="status">
              <div>
                <strong>Import termine</strong>
                <p>{report.idempotent ? "Cette demande avait déjà été exécutée: Atlas affiche le même rapport." : "Les écritures validées ont été appliquées dans une transaction unique."}</p>
              </div>
              <div className="grid import-review-summary">
                <Metric label="Personnes créées" value={report.summary.peopleCreated} />
                <Metric label="Personnes rattachees" value={report.summary.peopleLinked} />
                <Metric label="Organisations créées" value={report.summary.organizationsCreated} />
                <Metric label="Organisations rattachees" value={report.summary.organizationsLinked} />
                <Metric label="Relations créées" value={report.summary.relationshipsCreated} />
                <Metric label="Relations rattachees" value={report.summary.relationshipsLinked} />
                <Metric label="Lignes ignorees" value={report.summary.rowsIgnored} />
                <Metric label="A examiner" value={report.summary.rowsReviewLater} />
              </div>
              <p className="muted">
                Pipeline: {report.summary.pipelineIntegrationEnabled ? `${report.summary.relationshipsSkipped} ligne(s) non éligible(s) ou déjà protégée(s).` : "option non activée pour cet import."}
              </p>
              {report.errors.length > 0 ? <ul className="error-list">{report.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </section>
          ) : null}

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="import-actions">
            <Button variant="subtle" type="button" onClick={step === "mapping" || step === "report" ? reset : () => setStep("mapping")}>
              {step === "mapping" ? "Retour a la previsualisation" : step === "report" ? "Importer un autre fichier" : "Retour a la correspondance"}
            </Button>
            {step === "mapping" ? (
              <Button disabled={!validation.valid || loading} type="button" onClick={() => void validateMapping()}>
                {loading ? "Vérification..." : "Valider et vérifier"}
              </Button>
            ) : step === "ready" ? (
              <Button disabled={!decisionValidation.valid || loading} type="button" onClick={() => void executeImport()}>
                {loading ? "Import en cours..." : "Confirmer et lancer l'import"}
              </Button>
            ) : step === "report" ? null : (
              <Button disabled={!decisionValidation.valid} type="button" onClick={continueToNextStep}>
                Preparer la suite
              </Button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <p className="muted">{label}</p>
      <strong className="metric-value">{value}</strong>
    </div>
  );
}
