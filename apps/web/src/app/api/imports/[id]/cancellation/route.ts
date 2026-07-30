import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { ApiError } from "@/lib/api-errors";
import { analyzeCsvImportCancellation, cancelCsvImport } from "@/repositories/csv-import-history";
import { getTenantContext } from "@/repositories/tenant-context";

type RouteParams = { params: Promise<{ id: string }> };

function assertCancellationRole(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new ApiError("Seuls les roles owner et admin peuvent annuler un import.", 403, "FORBIDDEN");
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    assertCancellationRole(context.role);

    const { id } = await params;
    const eligibility = await analyzeCsvImportCancellation(context, id);
    return NextResponse.json({ data: eligibility });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
    assertCancellationRole(context.role);

    const body = await request.json().catch(() => null) as { confirm?: boolean; idempotencyKey?: string } | null;
    if (body?.confirm !== true) {
      throw new ApiError("Confirmez explicitement l'annulation avant de continuer.", 400, "CSV_IMPORT_CANCELLATION_CONFIRMATION_REQUIRED");
    }
    if (!body.idempotencyKey || body.idempotencyKey.length < 8) {
      throw new ApiError("Cle d'idempotence d'annulation invalide.", 400, "CSV_IMPORT_CANCELLATION_IDEMPOTENCY_REQUIRED");
    }

    const { id } = await params;
    const report = await cancelCsvImport(context, id, body.idempotencyKey);
    return NextResponse.json({ data: report });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export const dynamic = "force-dynamic";
