import Link from "next/link";
import { csvImportCancellationStatusLabels } from "@/features/csv-import/csv-import-history";
import type { CsvImportHistoryResult } from "@/repositories/csv-import-history";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris"
  }).format(new Date(value));
}

export function CsvImportHistoryList({ result }: { result: CsvImportHistoryResult }) {
  if (result.imports.length === 0) {
    return (
      <section className="card empty-state">
        <h2>Aucun import execute</h2>
        <p className="muted">Les imports termines apparaitront ici avec leur rapport et leur etat d&apos;annulation.</p>
      </section>
    );
  }

  return (
    <section className="stack">
      <div className="import-history-list">
        {result.imports.map((item) => (
          <article className="card import-history-card" key={item.id}>
            <div>
              <p className="muted">{formatDate(item.createdAt)}</p>
              <h3>{item.sourceName || "Import CSV"}</h3>
              <p className="muted">Par {item.requestedByLabel}</p>
            </div>
            <dl className="import-history-metrics">
              <div><dt>Lignes</dt><dd>{item.totalRows}</dd></div>
              <div><dt>Creees</dt><dd>{item.peopleCreated + item.organizationsCreated}</dd></div>
              <div><dt>Rattachees</dt><dd>{item.peopleLinked + item.organizationsLinked}</dd></div>
              <div><dt>Ignorees</dt><dd>{item.rowsIgnored}</dd></div>
              <div><dt>A examiner</dt><dd>{item.rowsReviewLater}</dd></div>
              <div><dt>Rejetees</dt><dd>{item.rowsRejected}</dd></div>
            </dl>
            <div className="import-history-status">
              <span className="status-badge">{item.status === "succeeded" ? "Import termine" : item.status}</span>
              {item.cancellationStatus ? <span className="status-badge warning">{csvImportCancellationStatusLabels[item.cancellationStatus]}</span> : <span className="status-badge subtle">Non annule</span>}
            </div>
            <Link className="button subtle-button" href={`/imports/${item.id}`}>Consulter le detail</Link>
          </article>
        ))}
      </div>

      {result.pageCount > 1 ? (
        <nav className="pagination" aria-label="Pagination des imports">
          {result.page > 1 ? <Link className="button subtle-button" href={`/imports?page=${result.page - 1}`}>Precedent</Link> : null}
          <span>Page {result.page} / {result.pageCount}</span>
          {result.page < result.pageCount ? <Link className="button subtle-button" href={`/imports?page=${result.page + 1}`}>Suivant</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
