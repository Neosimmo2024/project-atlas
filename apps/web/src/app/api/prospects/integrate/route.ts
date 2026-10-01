import { NextResponse } from "next/server";
import { z } from "zod";
import { prospectSourceSchema } from "@/features/prospect-discovery/integration";
import { ApiError } from "@/lib/api-errors";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getTenantContext } from "@/repositories/tenant-context";
import { loadProspectImport, assertProspectMatchesContactable, findCompletedProspectImport } from "@/repositories/prospect-integration";
import { previewTenantCsvImport } from "@/repositories/csv-import-preview";
import { executeTenantCsvImport } from "@/repositories/csv-import-execution";

const schema = z.object({
  source: prospectSourceSchema, analysisFingerprint: z.string().min(1),
  decisions: z.array(z.object({ lineNumber: z.number().int().positive(),
    decision: z.enum(["create_new", "link_existing", "ignore_row", "review_later"]),
    targetPersonId: z.string().uuid().nullable().optional(), targetOrganizationId: z.string().uuid().nullable().optional()
  })).max(1),
  addToPipeline: z.boolean(), confirm: z.literal(true), personConfirmed: z.literal(true)
});
export async function POST(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) throw new ApiError("Connectez-vous à Atlas.", 401, "UNAUTHENTICATED");
    if (context.role === "reader") throw new ApiError("Action non autorisée.", 403, "FORBIDDEN");
    const body = schema.parse(await request.json());
    // The client never supplies the imported contact data or execution key.
    const source = await loadProspectImport(context, body.source.listId, body.source.siret);
    if (source.source.reviewedAt !== body.source.reviewedAt) throw new ApiError("La fiche a changé. Rechargez l’aperçu avant de confirmer.", 409, "PROSPECT_STALE");
    const completed = await findCompletedProspectImport(context, source.idempotencyKey);
    if (completed) return NextResponse.json({ data: completed });
    const preview = await previewTenantCsvImport(context, source);
    await assertProspectMatchesContactable(context, preview);
    const data = await executeTenantCsvImport(context, {
      preview, decisions: body.decisions, analysisFingerprint: body.analysisFingerprint,
      idempotencyKey: source.idempotencyKey, sourceName: source.fileName, addToPipeline: body.addToPipeline
    });
    return NextResponse.json({ data });
  } catch (error) { return apiErrorResponse(error); }
}
export const dynamic = "force-dynamic";
