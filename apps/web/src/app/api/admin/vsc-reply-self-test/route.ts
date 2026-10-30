import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { canRunVscReplySelfTest, verifyVscReplySelfTest } from "@/services/vsc-reply-self-test";
export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Origine non autorisée." }, { status: 403, headers });
  const context = await getTenantContext(process.env.VSC_OVH_TENANT_ID?.trim());
  if (!context || !canRunVscReplySelfTest(context)) return NextResponse.json({ error: "Test QA non disponible." }, { status: 403, headers });
  try {
    const body = await request.json();
    if (body.testId !== undefined && (typeof body.testId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.testId))) return NextResponse.json({ error: "Test invalide." }, { status: 400, headers });
    const result = await verifyVscReplySelfTest(context, body.testId);
    return NextResponse.json(result, { status: result.success || result.pending ? 200 : 503, headers });
  } catch { return NextResponse.json({ error: "Test temporairement indisponible." }, { status: 503, headers }); }
}
