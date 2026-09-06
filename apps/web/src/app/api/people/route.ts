import { NextResponse } from "next/server";
import { createPerson, findPotentialPersonDuplicates, listPeople } from "@/repositories/people";
import { getTenantContext } from "@/repositories/tenant-context";
import { parsePersonInput } from "@/features/people/validation";
import { ensureRecruitingRelationshipForPerson } from "@/services/recruitment-person-onboarding";

function validationErrorResponse(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return NextResponse.json(
    { error: "Les informations saisies sont invalides.", fields: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
    { status: 400 }
  );
}

export async function GET(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const url = new URL(request.url);
  const result = await listPeople(context, {
    query: url.searchParams.get("query") ?? "",
    status: url.searchParams.get("status") ?? "",
    priority: url.searchParams.get("priority") ?? "",
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize: Number(url.searchParams.get("pageSize") ?? 10)
  });
  return NextResponse.json({ data: result.people, pagination: { total: result.total, page: result.page, pageSize: result.pageSize, pageCount: result.pageCount } });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Tenant context not found" }, { status: 401 });
  const body = await request.json();
  const parsed = parsePersonInput(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  const createRecruitingRelationship = body.create_recruiting_relationship === true;
  const recruitingOrganizationId = typeof body.recruiting_organization_id === "string" ? body.recruiting_organization_id.trim() : "";
  if (createRecruitingRelationship && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recruitingOrganizationId)) {
    return NextResponse.json({
      error: "Sélectionnez l’organisation de recrutement.",
      fields: [{ field: "recruiting_organization_id", message: "L’organisation est obligatoire pour ajouter le candidat au Pipeline." }]
    }, { status: 400 });
  }

  const duplicates = await findPotentialPersonDuplicates(context, parsed.data);
  if (duplicates.length > 0 && body.confirmDuplicate !== true) {
    return NextResponse.json({ warning: "Potential duplicate found", duplicates }, { status: 409 });
  }

  const person = await createPerson(context, parsed.data);
  const recruitingRelationship = createRecruitingRelationship
    ? await ensureRecruitingRelationshipForPerson(context, person.id, recruitingOrganizationId)
    : null;

  return NextResponse.json({ data: person, recruitingRelationship }, { status: 201 });
}
