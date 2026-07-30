"use client";

import { useMemo, useState } from "react";
import {
  CSV_IMPORT_FIELD_DEFINITIONS,
  CSV_IMPORT_FIELD_GROUP_LABELS,
  validateCsvImportMapping
} from "@/features/csv-import/csv-import-mapping";
import type {
  CsvImportMapping,
  CsvImportMappingValue,
  CsvImportPreviewResult
} from "@/features/csv-import/csv-import";
import { Button } from "@/components/ui";

type Step = "upload" | "mapping" | "validated";

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.error || body?.message || "Le fichier n'a pas pu être analysé.";
}

export function CsvImportMapping() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<CsvImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<CsvImportMapping>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validation = useMemo(
    () => preview ? validateCsvImportMapping(preview.headers, mapping) : { valid: false, errors: [] },
    [mapping, preview]
  );

  async function selectFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        throw new Error("Sélectionnez un fichier CSV.");
      }
      const content = await file.text();
      const response = await fetch("/api/imports/csv/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      if (!response.ok) throw new Error(await responseMessage(response));

      const result = await response.json() as CsvImportPreviewResult;
      setFileName(file.name);
      setPreview(result);
      setMapping(result.proposedMapping);
      setStep("mapping");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Le fichier n'a pas pu être analysé.");
    } finally {
      setLoading(false);
    }
  }

  function updateMapping(header: string, value: CsvImportMappingValue) {
    setMapping((current) => ({ ...current, [header]: value }));
    if (step === "validated") setStep("mapping");
  }

  function validateMapping() {
    if (!validation.valid) return;
    setStep("validated");
  }

  function reset() {
    setStep("upload");
    setFileName("");
    setPreview(null);
    setMapping({});
    setError(null);
  }

  return (
    <div className="stack">
      <ol className="import-steps" aria-label="Étapes de l'import">
        <li className="done">1. Prévisualisation</li>
        <li className={step !== "upload" ? "active" : ""}>2. Correspondance</li>
        <li>3. Vérification des données</li>
      </ol>

      {step === "upload" ? (
        <section className="card import-upload">
          <div>
            <h2>Choisir le fichier à préparer</h2>
            <p>Le fichier est lu pour afficher ses colonnes. Aucune donnée n&apos;est créée dans Atlas.</p>
          </div>
          <label className="button link-button import-file-button">
            {loading ? "Lecture en cours…" : "Sélectionner un CSV"}
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

          {step === "validated" ? (
            <section className="import-validation-success" role="status">
              <strong>Correspondance validée</strong>
              <p>Le mapping est prêt pour l&apos;étape suivante. Aucune personne ni relation n&apos;a été créée.</p>
            </section>
          ) : null}

          <div className="import-actions">
            <Button variant="subtle" type="button" onClick={reset}>Retour à la prévisualisation</Button>
            <Button disabled={!validation.valid} type="button" onClick={validateMapping}>
              {step === "validated" ? "Mapping validé" : "Valider et continuer"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
