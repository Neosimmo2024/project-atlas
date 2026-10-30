import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canManageOvh } from "@/services/ovh-connection";
import { inspectVscBrevoSmsAccount } from "@/services/vsc-brevo-sms-status";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
    const context = tenantId ? await getTenantContext(tenantId) : null;
    if (!context || !canManageOvh(context)) return NextResponse.json({ error: "Accès non autorisé" }, { status: 403, headers });
    return NextResponse.json(await inspectVscBrevoSmsAccount(context.tenantId), { headers });
  } catch { return NextResponse.json({ error: "Vérification indisponible" }, { status: 503, headers }); }
}
