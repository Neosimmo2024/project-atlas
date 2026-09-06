import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const form = readFileSync(resolve(root, "apps/web/src/components/people/person-form.tsx"), "utf8");
const route = readFileSync(resolve(root, "apps/web/src/app/api/people/route.ts"), "utf8");
const onboarding = readFileSync(resolve(root, "apps/web/src/services/recruitment-person-onboarding.ts"), "utf8");
const page = readFileSync(resolve(root, "apps/web/src/app/(app)/people/new/page.tsx"), "utf8");

describe("lot 9F automatic recruitment pipeline onboarding", () => {
  it("offers direct candidate creation into the recruitment pipeline while keeping simple person creation possible", () => {
    expect(form).toContain("Candidat recrutement — ajouter automatiquement au Pipeline");
    expect(form).toContain('name="create_recruiting_relationship"');
    expect(form).toContain('name="recruiting_organization_id"');
    expect(form).toContain("setAddToRecruitmentPipeline");
  });

  it("loads organization options on the new-person page", () => {
    expect(page).toContain("listRelationshipOrganizationOptions");
    expect(page).toContain("organizationOptions={organizationOptions}");
  });

  it("creates or reuses one active recruiting relationship in detection", () => {
    expect(route).toContain("ensureRecruitingRelationshipForPerson");
    expect(onboarding).toContain('relationship_type: "recruiting"');
    expect(onboarding).toContain('pipeline_stage: "detection"');
    expect(onboarding).toContain('status: "active"');
    expect(onboarding).toContain("findPotentialRelationshipDuplicates");
    expect(onboarding).toContain("if (duplicates.length > 0) return duplicates[0].relationship");
  });

  it("redirects a newly created candidate to the pipeline", () => {
    expect(form).toContain("result.recruitingRelationship");
    expect(form).toContain("/pipeline?query=");
  });
});
