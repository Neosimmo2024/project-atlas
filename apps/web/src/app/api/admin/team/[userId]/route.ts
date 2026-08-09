import { NextResponse } from "next/server";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/security/api-errors";
import { manageTenantMember } from "@/repositories/tenant-admin";
import { getTenantContext } from "@/repositories/tenant-context";

type RouteContext = { params: Promise<{ userId: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("change_role"), role: z.enum(["owner", "admin", "recruiter", "manager", "reader"]) }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reactivate") })
]);

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Les informations saisies sont invalides.", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const tenantContext = await getTenantContext();
    if (!tenantContext) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });

    const { userId } = await context.params;
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return validationErrorResponse(parsed.error);

    await manageTenantMember(tenantContext, { targetUserId: userId, action: parsed.data.action, role: "role" in parsed.data ? parsed.data.role : undefined });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
