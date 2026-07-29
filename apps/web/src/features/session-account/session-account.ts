import type { RoleSlug } from "@/types/domain";

export type SessionAccountSummary = {
  statusLabel: "Connecté";
  identityLabel: string;
  tenantLabel: string;
  roleLabel: string;
};

const ROLE_LABELS: Record<RoleSlug, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  recruiter: "Recruteur",
  manager: "Manager",
  reader: "Lecteur"
};

export function accountIdentityLabel(fullName?: string | null, email?: string | null) {
  const normalizedName = fullName?.trim();
  if (normalizedName) return normalizedName;

  const normalizedEmail = email?.trim();
  if (normalizedEmail) return normalizedEmail;

  return "Utilisateur Atlas";
}

export function tenantDisplayLabel(tenantName?: string | null) {
  const normalizedTenant = tenantName?.trim();
  return normalizedTenant || "Aucun tenant actif";
}

export function roleDisplayLabel(role?: RoleSlug | null) {
  return role ? ROLE_LABELS[role] : "Rôle non défini";
}

export function sessionAccountSummary(input: {
  fullName?: string | null;
  email?: string | null;
  tenantName?: string | null;
  role?: RoleSlug | null;
}): SessionAccountSummary {
  return {
    statusLabel: "Connecté",
    identityLabel: accountIdentityLabel(input.fullName, input.email),
    tenantLabel: tenantDisplayLabel(input.tenantName),
    roleLabel: roleDisplayLabel(input.role)
  };
}
