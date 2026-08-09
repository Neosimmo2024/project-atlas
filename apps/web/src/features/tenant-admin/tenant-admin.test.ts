import { describe, expect, it } from "vitest";

import {
  canAccessTenantAdministration,
  canActorManageMember,
  canActorReactivateMember,
  canActorSuspendMember,
  memberDisplayName,
  roleOptionsForActor,
  tenantMemberPublicMessage,
  type TenantMember
} from "./tenant-admin";

const member: TenantMember = {
  id: "membership-a",
  userId: "user-a",
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: "recruiter",
  status: "active",
  isCurrentUser: false
};

describe("tenant administration rules", () => {
  it("allows only owner and admin to access tenant administration", () => {
    expect(canAccessTenantAdministration("owner")).toBe(true);
    expect(canAccessTenantAdministration("admin")).toBe(true);
    expect(canAccessTenantAdministration("recruiter")).toBe(false);
    expect(canAccessTenantAdministration("manager")).toBe(false);
    expect(canAccessTenantAdministration("reader")).toBe(false);
  });

  it("limits role choices for admins while owners can assign owner", () => {
    expect(roleOptionsForActor("owner").map((role) => role.value)).toEqual(["owner", "admin", "recruiter", "manager", "reader"]);
    expect(roleOptionsForActor("admin").map((role) => role.value)).toEqual(["admin", "recruiter", "manager", "reader"]);
  });

  it("prevents admins from managing owners and prevents invited rows from being managed", () => {
    expect(canActorManageMember("admin", { ...member, role: "owner" })).toBe(false);
    expect(canActorManageMember("owner", { ...member, status: "invited" })).toBe(false);
    expect(canActorManageMember("admin", member)).toBe(true);
  });

  it("prevents self suspension and exposes reactivation only for suspended members", () => {
    expect(canActorSuspendMember("owner", { ...member, isCurrentUser: true })).toBe(false);
    expect(canActorSuspendMember("owner", member)).toBe(true);
    expect(canActorReactivateMember("owner", { ...member, status: "suspended" })).toBe(true);
    expect(canActorReactivateMember("owner", member)).toBe(false);
  });

  it("formats names, fallback labels and safe public errors", () => {
    expect(memberDisplayName({ full_name: "  Grace Hopper  ", email: "grace@example.test" })).toBe("Grace Hopper");
    expect(memberDisplayName({ full_name: "", email: "grace@example.test" })).toBe("grace@example.test");
    expect(tenantMemberPublicMessage("TENANT_MEMBER_LAST_OWNER_PROTECTED")).toContain("dernier propriétaire actif");
    expect(tenantMemberPublicMessage("unknown")).toBe("L’opération n’a pas pu être effectuée.");
  });
});
