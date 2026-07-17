export type RoleSlug = "owner" | "admin" | "recruiter" | "manager" | "reader";

export type TenantScoped = { tenant_id: string };
export type PersonStatus = "to_qualify" | "qualified" | "contacted" | "in_relationship" | "rejected" | "archived";
export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "waiting" | "completed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskSourceType = "manual" | "person" | "organization" | "relationship" | "interaction";
export type TaskDueFilter = "overdue" | "today" | "week";

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
  legal_name: string | null;
  organization_type: string | null;
  siren: string | null;
  siret: string | null;
  vat_number: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  department: string | null;
  country: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  parent_organization_id: string | null;
  source: string | null;
  comments: string | null;
  status: "active" | "inactive" | "archived";
  contact_allowed: boolean;
  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
};

export type Relationship = TenantScoped & {
  id: string;
  person_id: string;
  organization_id: string;
  relationship_type: "recruiting" | "management" | "partnership" | "customer" | "supplier" | "referrer" | "prospecting";
  pipeline_stage: "detection" | "qualification" | "first_contact" | "conversation" | "meeting" | "presentation" | "reflection" | "negotiation" | "signature" | "onboarding" | "development" | "ambassador" | "refusal" | "closed";
  status: "active" | "paused" | "won" | "lost" | "archived";
  owner_user_id: string | null;
  score: number | null;
  confidence: number | null;
  next_action_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  last_interaction_at: string | null;
  notes: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type InteractionType = {
  id: string;
  tenant_id: string | null;
  slug: string;
  label: string;
  sort_order: number;
  is_system: boolean;
  created_at: string;
  updated_at: string;
};

export type Interaction = TenantScoped & {
  id: string;
  person_id: string | null;
  organization_id: string | null;
  relationship_id: string | null;
  type_id: string;
  title: string;
  summary: string | null;
  interaction_date: string;
  duration_minutes: number | null;
  location: string | null;
  created_by: string | null;
  change_reason: string | null;
  main_obstacle: string | null;
  timing: string | null;
  dna_compatibility: string | null;
  work_with_person_desire: string | null;
  comments: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Task = TenantScoped & {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
  person_id: string | null;
  organization_id: string | null;
  relationship_id: string | null;
  interaction_id: string | null;
  source_type: TaskSourceType | null;
  source_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type TenantContext = {
  tenantId: string;
  tenant: { id: string; name: string };
  userId: string;
  role: RoleSlug;
};
