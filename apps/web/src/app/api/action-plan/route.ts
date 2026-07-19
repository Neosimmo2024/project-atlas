import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/security/api-errors";
import { getActionPlanForUser } from "@/repositories/action-plan";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET(request: Request) {
  try {
    const context = await getTenantContext();
    if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim();
    if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });

    const nowParam = url.searchParams.get("now")?.trim();
    const now = nowParam ? new Date(nowParam) : new Date();
    if (Number.isNaN(now.getTime())) return NextResponse.json({ error: "now is invalid" }, { status: 400 });

    const items = await getActionPlanForUser(context, { organizationId, now });
    return NextResponse.json({ data: items });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
