import { NextResponse } from "next/server";
import { createOrganization, listOrganizations } from "@/repositories/organizations";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const organizations = await listOrganizations(context);
  return NextResponse.json({ data: organizations });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const body = await request.json();
  const organization = await createOrganization(context, body);
  return NextResponse.json({ data: organization }, { status: 201 });
}
