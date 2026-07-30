import Link from "next/link";
import { CsvImportHistoryList } from "@/components/csv-import/csv-import-history-list";
import { CsvImportMapping } from "@/components/csv-import/csv-import-mapping";
import { listCsvImportHistory } from "@/repositories/csv-import-history";
import { getTenantContext } from "@/repositories/tenant-context";

type ImportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function paramValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ImportsPage({ searchParams }: ImportsPageProps) {
  const params = await searchParams;
  const page = Number(paramValue(params, "page") || 1);
  const context = await getTenantContext();
  const history = context
    ? await listCsvImportHistory(context, { page, pageSize: 10 })
    : { imports: [], total: 0, page: 1, pageSize: 10, pageCount: 1 };

  return (
    <div className="page stack import-page">
      <header className="page-header">
        <div>
          <p className="muted">Entree de donnees</p>
          <h1>Importer des contacts</h1>
          <p className="muted">Preparez un fichier CSV, executez l&apos;import puis retrouvez chaque rapport dans l&apos;historique.</p>
        </div>
        <Link className="button subtle-button" href="#import-history">Historique des imports</Link>
      </header>
      <CsvImportMapping />
      <section className="stack" id="import-history">
        <header>
          <p className="muted">Historique</p>
          <h2>Imports CSV executes</h2>
        </header>
        <CsvImportHistoryList result={history} />
      </section>
    </div>
  );
}
