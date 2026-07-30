import { CsvImportMapping } from "@/components/csv-import/csv-import-mapping";

export default function ImportsPage() {
  return (
    <div className="page stack import-page">
      <header className="page-header">
        <div>
          <p className="muted">Entrée de données</p>
          <h1>Importer des contacts</h1>
        </div>
      </header>
      <CsvImportMapping />
    </div>
  );
}
