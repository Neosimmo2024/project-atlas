import { NextResponse } from "next/server";
import { createRelationship, listRelationships } from "@/repositories/relationships";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const relationships = await listRelationships(context);
  return NextResponse.json({ data: relationships });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const body = await request.json();
  const relationship = await createRelationship(context, body);
  return NextResponse.json({ data: relationship }, { status: 201 });
}
