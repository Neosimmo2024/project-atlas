"use client";

import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui";

type Step = "upload" | "mapping" | "review" | "ready";

type PreviewApiResponse = {
  data?: CsvImportPreviewResult;
  error?: string;
  message?: string;
};

const decisionLabels: Record<CsvImportDecision | "", string> = {
  "": "Décision à prendre",
  create_new: "Considérer comme nouvelle entrée",
  link_existing: "Rattacher à l'enregistrement Atlas",
  ignore_row: "Ignorer la ligne",
  review_later: "Conserver à examiner"
};

async function parsePreviewResponse(response: Response) {
  const body = await response.json().catch(() => null) as PreviewApiResponse | null;
  if (!response.ok || !body?.data) {
    throw new Error(body?.error || body?.message || "Le fichier n'a pas pu être analysé.");
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
        throw new Error("Sélectionnez un fichier CSV.");
      }
      const fileContent = await file.text();
      const result = await requestPreview(fileContent);
      setFileName(file.name);
      setContent(fileContent);
      setPreview(result);
      setMapping(result.proposedMapping);
      setDecisions(defaultDecisions(result));
      setStep("mapping");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le fichier n'a pas pu être analysé.");
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
      setStep("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La vérification n'a pas pu être recalculée.");
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

  function reset() {
    setStep("upload");
    setFileName("");
    setContent("");
    setPreview(null);
    setMapping({});
    setDecisions({});
    setError(null);
  }

  return (
    <div className="stack">
      <ol className="import-steps" aria-label="Étapes de l'import">
        <li className={step !== "upload" ? "done" : "active"}>1. Prévisualisation</li>
        <li className={step === "review" || step === "ready" ? "done" : step === "mapping" ? "active" : ""}>2. Correspondance</li>
        <li className={step === "review" ? "active" : step === "ready" ? "done" : ""}>3. Vérification des données</li>
      </ol>

      {step === "upload" ? (
        <section className="card import-upload">
          <div>
            <h2>Choisir le fichier à préparer</h2>
            <p>Le fichier est lu pour afficher ses colonnes. Aucune donnée n&apos;est créée dans Atlas.</p>
          </div>
          <label className="button link-button import-file-button">
            {loading ? "Lecture en cours..." : "Sélectionner un CSV"}
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
                  <p className="muted">Les suggestions sont modifiables. Choisissez « Ignorer cette colonne » si elle ne doit pas être reprise.</p>
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
                            {samples.length > 0 ? samples.join(" · ") : "Aucune valeur d'exemple"}
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
                  <strong>Correspondance à compléter</strong>
                  <ul>{validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ) : null}
            </>
          ) : null}

          {step === "review" || step === "ready" ? (
            <section className="stack">
              <header>
                <h2>Vérification et doublons détectés</h2>
                <p className="muted">Les valeurs originales restent visibles. Les valeurs normalisées servent uniquement à la comparaison.</p>
              </header>

              <div className="grid import-review-summary">
                <Metric label="Lignes analysées" value={preview.summary.totalRows} />
                <Metric label="Sans correspondance" value={preview.summary.cleanRows} />
                <Metric label="Doublons fichier" value={preview.summary.internalDuplicates} />
                <Metric label="Correspondances Atlas" value={preview.summary.atlasMatches} />
                <Metric label="Cas ambigus" value={preview.summary.ambiguousRows} />
                <Metric label="Décisions restantes" value={decisionValidation.pendingDecisions} />
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
                        Décision préparée
                        <select
                          className="input"
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
                        <strong>Valeurs normalisées</strong>
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
                            {match.differences.length > 0 ? <span>Différences: {match.differences.join(" | ")}</span> : null}
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
                  <strong>Décisions à compléter</strong>
                  <ul>{decisionValidation.errors.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
              ) : null}
            </section>
          ) : null}

          {step === "ready" ? (
            <section className="import-validation-success" role="status">
              <strong>Vérification validée</strong>
              <p>Les décisions sont préparées pour la prochaine étape. Aucun import définitif n&apos;a été lancé.</p>
            </section>
          ) : null}

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <div className="import-actions">
            <Button variant="subtle" type="button" onClick={step === "mapping" ? reset : () => setStep("mapping")}>
              {step === "mapping" ? "Retour à la prévisualisation" : "Retour à la correspondance"}
            </Button>
            {step === "mapping" ? (
              <Button disabled={!validation.valid || loading} type="button" onClick={() => void validateMapping()}>
                {loading ? "Vérification..." : "Valider et vérifier"}
              </Button>
            ) : (
              <Button disabled={!decisionValidation.valid} type="button" onClick={continueToNextStep}>
                {step === "ready" ? "Prêt pour l'étape suivante" : "Préparer la suite"}
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
