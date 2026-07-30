import Link from "next/link";
import { notFound } from "next/navigation";
import { CsvImportCancellationButton } from "@/components/csv-import/csv-import-cancellation-button";
import { csvImportCancellationReasonLabels, csvImportCancellationStatusLabels } from "@/features/csv-import/csv-import-history";
import { parseCsvImportExecutionReport } from "@/features/csv-import/csv-import-execution";
import { getCsvImportDetail } from "@/repositories/csv-import-history";
import { getTenantContext } from "@/repositories/tenant-context";

type ImportDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) return "Non renseigne";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris"
  }).format(new Date(value));
}

export default async function ImportDetailPage({ params }: ImportDetailPageProps) {
  const context = await getTenantContext();
  if (!context) notFound();

  const { id } = await params;
  const detail = await getCsvImportDetail(context, id);
  const report = parseCsvImportExecutionReport(detail.run.report);
  const canCancel = context.role === "owner" || context.role === "admin";
  const createdRows = report.rows.filter((row) => row.personCreated || row.organizationCreated);
  const linkedRows = report.rows.filter((row) => !row.personCreated && !row.organizationCreated && row.outcome === "linked");
  const passiveRows = report.rows.filter((row) => row.outcome !== "linked" && !row.personCreated && !row.organizationCreated);

  return (
    <div className="page stack import-detail-page">
      <header className="page-header">
        <div>
          <p className="muted">Import CSV</p>
          <h1>{detail.run.source_name || "Import CSV"}</h1>
          <p className="muted">Execute le {formatDate(detail.run.created_at)} par {detail.requestedByLabel}</p>
        </div>
        <Link className="button subtle-button" href="/imports">Retour aux imports</Link>
      </header>

      <section className="grid import-review-summary">
        <Metric label="Lignes" value={detail.run.total_rows} />
        <Metric label="People creees" value={detail.run.people_created} />
        <Metric label="People rattachees" value={detail.run.people_linked} />
        <Metric label="Organizations creees" value={detail.run.organizations_created} />
        <Metric label="Organizations rattachees" value={detail.run.organizations_linked} />
        <Metric label="Rejetees" value={detail.run.rows_rejected} />
      </section>

      <section className="card import-detail-summary">
        <div>
          <p className="muted">Statut de l&apos;import</p>
          <h2>{detail.run.status === "succeeded" ? "Import termine" : detail.run.status}</h2>
        </div>
        <div>
          <p className="muted">Statut d&apos;annulation</p>
          <h2>{detail.cancellation ? csvImportCancellationStatusLabels[detail.cancellation.status] : csvImportCancellationStatusLabels[detail.eligibility.status]}</h2>
        </div>
      </section>

      <CsvImportCancellationButton importId={detail.run.id} eligibility={detail.eligibility} canRequest={canCancel} />

      <section className="stack">
        <header>
          <p className="muted">Rapport</p>
          <h2>Donnees creees par l&apos;import</h2>
        </header>
        <Rows rows={createdRows} empty="Aucune donnee creee." />
      </section>

      <section className="stack">
        <header>
          <h2>Elements seulement rattaches</h2>
          <p className="muted">Ces donnees existaient deja et ne seront jamais supprimees par l&apos;annulation.</p>
        </header>
        <Rows rows={linkedRows} empty="Aucun rattachement." />
      </section>

      <section className="stack">
        <header>
          <h2>Lignes ignorees, conservees ou rejetees</h2>
        </header>
        <Rows rows={passiveRows} empty="Aucune ligne passive." />
      </section>

      <section className="stack">
        <header>
          <h2>Analyse d&apos;annulation</h2>
          <p className="muted">Les elements non supprimables restent conserves avec leur motif.</p>
        </header>
        <div className="import-cancellation-columns">
          <CancellationList title="People" items={detail.eligibility.people} />
          <CancellationList title="Organizations" items={detail.eligibility.organizations} />
        </div>
      </section>
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

function Rows({ rows, empty }: { rows: ReturnType<typeof parseCsvImportExecutionReport>["rows"]; empty: string }) {
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="import-row-table">
      {rows.map((row) => (
        <article className="card" key={`${row.lineNumber}-${row.outcome}`}>
          <p className="muted">Ligne {row.lineNumber}</p>
          <h3>{row.outcome}</h3>
          <p>Decision: {row.decision}</p>
          {row.personId ? <p>Person: {row.personId}</p> : null}
          {row.organizationId ? <p>Organization: {row.organizationId}</p> : null}
        </article>
      ))}
    </div>
  );
}

function CancellationList({ title, items }: { title: string; items: Array<{ id: string; label: string; deletable: boolean; reason: string | null }> }) {
  if (items.length === 0) return <p className="muted">Aucun element {title.toLowerCase()} cree par cet import.</p>;
  return (
    <div className="card">
      <h3>{title}</h3>
      <ul className="import-cancellation-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong>
            <span>{item.deletable ? "supprimable" : `conservee: ${item.reason ? csvImportCancellationReasonLabels[item.reason] ?? item.reason : "suppression interdite"}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
