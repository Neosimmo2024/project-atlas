export type RoleSlug = "owner" | "admin" | "recruiter" | "manager" | "reader";

export type TenantScoped = { tenant_id: string };
export type PersonStatus = "a_qualifier" | "qualifie" | "contacte" | "en_relation" | "non_retenu" | "archive";
export type Priority = "basse" | "moyenne" | "haute";

export type Person = TenantScoped & {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  city: string | null;
  postal_code: string | null;
  department: string | null;
  linkedin_url: string | null;
  job_title: string | null;
  comments: string | null;
  source: string | null;
  status: PersonStatus;
  talent_types: string[];
  priority: Priority;
  talent_score: number | null;
  contact_allowed: boolean;
  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
};

export type Organization = TenantScoped & {
  id: string;
  name: string;
  organization_type: string | null;
  siren: string | null;
  website_url: string | null;
  city: string | null;
  department: string | null;
  status: "active" | "inactive" | "archived";
  created_at: string;
  updated_at: string;
};

export type Relationship = TenantScoped & {
  id: string;
  person_id: string;
  organization_id: string | null;
  relationship_type: "recrutement" | "partenariat" | "prospection";
  phase: "detection" | "qualification" | "contact" | "entretien" | "suivi" | "clos";
  status: "active" | "paused" | "won" | "lost" | "archived";
  owner_user_id: string | null;
  next_action: string | null;
  next_action_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantContext = { tenantId: string; userId: string; role: RoleSlug };
