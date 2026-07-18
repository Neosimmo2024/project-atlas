import { NextResponse } from "next/server";
import { getActionPlanForUser } from "@/repositories/action-plan";
import { getTenantContext } from "@/repositories/tenant-context";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erreur inconnue.";
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
  const isMissingSchema = code === "42703" || message.includes("action_plan_decisions") || message.includes("snoozed_until");

  return NextResponse.json(
    {
      error: isMissingSchema
        ? `Schema Supabase incomplet: ${message}. Executez la migration supabase/migrations/0007_action_plan_engine.sql puis reessayez.`
        : message,
      code
    },
    { status: isMissingSchema ? 500 : 400 }
  );
}

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
    return errorResponse(error);
  }
}
