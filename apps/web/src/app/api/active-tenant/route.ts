import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide" }, { status: 400 }); }
  const tenantId = typeof body === "object" && body !== null && "tenantId" in body ? (body as { tenantId?: unknown }).tenantId : null;
  if (typeof tenantId !== "string" || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const { data, error } = await supabase.from("tenant_users").select("tenant_id")
    .eq("user_id", user.id).eq("tenant_id", tenantId).eq("status", "active").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set("atlas_active_tenant", tenantId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
