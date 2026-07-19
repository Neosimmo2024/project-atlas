import { NextResponse } from "next/server";
import { listRecruitmentPipeline, parsePipelineFilters } from "@/repositories/recruitment-pipeline";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const filters = parsePipelineFilters(params);
    const result = await listRecruitmentPipeline(context, filters);

    return NextResponse.json({
      data: result.cards,
      owners: result.owners,
      invalidStages: result.invalidStages,
      pagination: {
        page: result.page,
        pageSize: result.pageSize,
        pageCount: result.pageCount,
        total: result.total
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de charger le pipeline.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
