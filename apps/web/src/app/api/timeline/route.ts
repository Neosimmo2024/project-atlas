import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { listTimelineEvents } from "@/repositories/timeline-events";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const url = new URL(request.url);
    const result = await listTimelineEvents(context, {
      personId: url.searchParams.get("personId") ?? "",
      organizationId: url.searchParams.get("organizationId") ?? "",
      relationshipId: url.searchParams.get("relationshipId") ?? "",
      projectId: url.searchParams.get("projectId") ?? "",
      eventType: url.searchParams.get("eventType") ?? "",
      category: url.searchParams.get("category") ?? "all",
      dateFrom: url.searchParams.get("dateFrom") ?? "",
      dateTo: url.searchParams.get("dateTo") ?? "",
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 10)
    });

    return NextResponse.json({ data: result.events, pagination: { total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
