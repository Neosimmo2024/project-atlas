"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { csvImportCancellationReasonLabels, csvImportCancellationStatusLabels, type CsvImportCancellationEligibility, type CsvImportCancellationReport } from "@/features/csv-import/csv-import-history";

type CancellationApiResponse = {
  data?: CsvImportCancellationReport;
  error?: string;
  message?: string;
};

function parseResponse(response: Response) {
  return response.json().catch(() => null) as Promise<CancellationApiResponse | null>;
}

function canCancel(status: CsvImportCancellationEligibility["status"]) {
  return status === "cancellable" || status === "partially_cancellable" || status === "no_action_needed";
}

export function CsvImportCancellationButton({ importId, eligibility, canRequest }: { importId: string; eligibility: CsvImportCancellationEligibility; canRequest: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CsvImportCancellationReport | null>(null);
  const idempotencyKey = useMemo(() => `cancel-${importId}-${crypto.randomUUID()}`, [importId]);
  const cancellable = canRequest && canCancel(eligibility.status);

  async function executeCancellation() {
    if (!confirmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/imports/${importId}/cancellation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, idempotencyKey })
      });
      const body = await parseResponse(response);
      if (!response.ok || !body?.data) {
        throw new Error(body?.error || body?.message || "L'annulation n'a pas pu etre executee.");
      }
      setReport(body.data);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "L'annulation n'a pas pu etre executee.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card import-cancellation-panel">
      <div>
        <p className="muted">Annulation securisee</p>
        <h2>{csvImportCancellationStatusLabels[eligibility.status]}</h2>
        <p>
          Atlas ne supprimera que les donnees creees par cet import, encore inchangees et sans dependance metier bloquante.
        </p>
      </div>

      <div className="grid import-review-summary">
        <Metric label="Supprimables" value={eligibility.summary.deletable} />
        <Metric label="Conservees" value={eligibility.summary.kept} />
        <Metric label="People creees" value={eligibility.summary.peopleCreated} />
        <Metric label="Organizations creees" value={eligibility.summary.organizationsCreated} />
      </div>

      {report ? (
        <div className="import-cancellation-result" role="status">
          <strong>{csvImportCancellationStatusLabels[report.status]}</strong>
          <p>{report.summary.peopleDeleted + report.summary.organizationsDeleted} donnee(s) supprimee(s), {report.summary.peopleKept + report.summary.organizationsKept} conservee(s).</p>
        </div>
      ) : null}

      {!canRequest ? <p className="form-error">Votre role ne permet pas d&apos;annuler un import.</p> : null}
      {!cancellable && canRequest ? <p className="muted">Aucune annulation automatique n&apos;est disponible pour cet import.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <Button disabled={!cancellable || loading} type="button" variant="subtle" onClick={() => setOpen(true)}>
        Demander l&apos;annulation
      </Button>

      {open ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card import-cancellation-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-import-title">
            <h2 id="cancel-import-title">Confirmer l&apos;annulation de l&apos;import</h2>
            <p>Cette action est irreversible pour les donnees effectivement supprimables. Les donnees rattachees, modifiees ou utilisees ailleurs seront conservees.</p>

            <div className="import-cancellation-columns">
              <EntityList title="People supprimables" items={eligibility.people.filter((item) => item.deletable)} />
              <EntityList title="People conservees" items={eligibility.people.filter((item) => !item.deletable)} />
              <EntityList title="Organizations supprimables" items={eligibility.organizations.filter((item) => item.deletable)} />
              <EntityList title="Organizations conservees" items={eligibility.organizations.filter((item) => !item.deletable)} />
            </div>

            <label className="confirm-check">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              Je confirme vouloir lancer l&apos;annulation securisee de cet import.
            </label>

            <div className="modal-actions">
              <Button type="button" variant="subtle" onClick={() => setOpen(false)} disabled={loading}>Annuler</Button>
              <Button type="button" onClick={() => void executeCancellation()} disabled={!confirmed || loading}>
                {loading ? "Annulation..." : "Valider l'annulation"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EntityList({ title, items }: { title: string; items: Array<{ id: string; label: string; reason: string | null }> }) {
  return (
    <div>
      <strong>{title}</strong>
      {items.length === 0 ? <p className="muted">Aucun element.</p> : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              {item.reason ? <small>{csvImportCancellationReasonLabels[item.reason] ?? item.reason}</small> : null}
            </li>
          ))}
        </ul>
      )}
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
