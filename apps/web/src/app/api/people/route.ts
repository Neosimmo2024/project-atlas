import { NextResponse } from "next/server";
import { createPerson, listPeople } from "@/repositories/people";
import { getTenantContext } from "@/repositories/tenant-context";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const people = await listPeople(context);
  return NextResponse.json({ data: people });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const body = await request.json();
  const person = await createPerson(context, body);
  return NextResponse.json({ data: person }, { status: 201 });
}
