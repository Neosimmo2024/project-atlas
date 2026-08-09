import type { RoleSlug } from "@/types/domain";

export type TenantMemberStatus = "active" | "invited" | "suspended";
export type TenantMemberAction = "change_role" | "suspend" | "reactivate";

export type TenantMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: RoleSlug;
  status: TenantMemberStatus;
  isCurrentUser: boolean;
};

export const TENANT_ADMIN_ALLOWED_ROLES = new Set<RoleSlug>(["owner", "admin"]);

export const TENANT_ADMIN_ROLE_LABELS: Record<RoleSlug, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  recruiter: "Recruteur",
  manager: "Manager",
  reader: "Lecteur"
};

export const TENANT_MEMBER_STATUS_LABELS: Record<TenantMemberStatus, string> = {
  active: "Actif",
  invited: "Invité",
  suspended: "Suspendu"
};

export function canAccessTenantAdministration(role: RoleSlug) {
  return TENANT_ADMIN_ALLOWED_ROLES.has(role);
}

export function roleOptionsForActor(actorRole: RoleSlug) {
  const roles: RoleSlug[] = actorRole === "owner"
    ? ["owner", "admin", "recruiter", "manager", "reader"]
    : ["admin", "recruiter", "manager", "reader"];

  return roles.map((role) => ({ value: role, label: TENANT_ADMIN_ROLE_LABELS[role] }));
}

export function memberDisplayName(profile: { full_name?: string | null; email?: string | null }, fallback = "Utilisateur Atlas") {
  return profile.full_name?.trim() || profile.email?.trim() || fallback;
}

export function canActorManageMember(actorRole: RoleSlug, member: Pick<TenantMember, "role" | "status" | "isCurrentUser">) {
  if (!canAccessTenantAdministration(actorRole)) return false;
  if (member.status === "invited") return false;
  if (actorRole === "admin" && member.role === "owner") return false;
  return true;
}

export function canActorSuspendMember(actorRole: RoleSlug, member: Pick<TenantMember, "role" | "status" | "isCurrentUser">) {
  if (!canActorManageMember(actorRole, member)) return false;
  if (member.isCurrentUser) return false;
  return member.status === "active";
}

export function canActorReactivateMember(actorRole: RoleSlug, member: Pick<TenantMember, "role" | "status" | "isCurrentUser">) {
  if (!canActorManageMember(actorRole, member)) return false;
  return member.status === "suspended";
}

export function tenantMemberPublicMessage(code?: string) {
  switch (code) {
    case "TENANT_MEMBER_LAST_OWNER_PROTECTED":
      return "Le dernier propriétaire actif du tenant doit être conservé.";
    case "TENANT_MEMBER_SELF_SUSPEND_FORBIDDEN":
      return "Vous ne pouvez pas suspendre votre propre accès.";
    case "TENANT_MEMBER_OWNER_PROTECTED":
    case "TENANT_MEMBER_OWNER_ROLE_FORBIDDEN":
      return "Cette opération sur un propriétaire n’est pas autorisée.";
    case "TENANT_MEMBER_FORBIDDEN":
      return "Vous n’avez pas les droits nécessaires pour administrer l’équipe.";
    case "TENANT_MEMBER_NOT_FOUND":
      return "Ce membre est introuvable dans le tenant actif.";
    case "TENANT_MEMBER_INVITED_NOT_MANAGED":
      return "Les invitations ne sont pas gérées dans cette version.";
    default:
      return "L’opération n’a pas pu être effectuée.";
  }
}
