import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CsvImportMapping } from "@/components/csv-import/csv-import-mapping";
import { getTenantContext } from "@/repositories/tenant-context";
import { loadProspectImport, assertProspectMatchesContactable, findCompletedProspectImport } from "@/repositories/prospect-integration";
import { previewTenantCsvImport } from "@/repositories/csv-import-preview";
import { publicErrorMessage } from "@/lib/security/api-errors";

export default async function ProspectIntegrationPage({ params }: { params: Promise<{ listId: string; siret: string }> }) {
  const context = await getTenantContext();
  if (!context) redirect("/login");
  const parsed = z.object({ listId: z.string().uuid(), siret: z.string().regex(/^\d{14}$/) }).safeParse(await params);
  if (!parsed.success) return <p>Prospect introuvable.</p>;
  let initialProspect;
  let completedId = "";
  let error = "";
  try {
    const source = await loadProspectImport(context, parsed.data.listId, parsed.data.siret);
    const completed = await findCompletedProspectImport(context, source.idempotencyKey);
    if (completed) completedId = completed.id;
    else {
      const preview = await previewTenantCsvImport(context, source);
      await assertProspectMatchesContactable(context, preview);
      initialProspect = { ...source, preview };
    }
  } catch (caught) { error = publicErrorMessage(caught); }
  return <div className="page stack">
    <header><h1>Intégrer un prospect vérifié</h1>
      <p>Vérifiez les correspondances avec Atlas, puis confirmez la création ou le rattachement. Les fiches existantes ne sont pas écrasées.</p>
      <Link href="/prospects">Retour aux listes</Link> · <Link href="/imports">Historique des intégrations</Link>
    </header>
    {error ? <p role="alert">{error}</p> : null}
    {completedId ? <p>Cette version du prospect a déjà été traitée. <Link href={`/imports/${completedId}`}>Consulter le rapport</Link>.</p> : null}
    {initialProspect ? <CsvImportMapping key={initialProspect.idempotencyKey} initialProspect={initialProspect} /> : null}
  </div>;
}
