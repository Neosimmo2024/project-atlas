export type RoleSlug = "owner" | "admin" | "recruiter" | "manager" | "reader";

export type TenantScoped = { tenant_id: string };
export type PersonStatus = "to_qualify" | "qualified" | "contacted" | "in_relationship" | "rejected" | "archived";
export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "waiting" | "completed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "critical";
export type TaskSourceType = "manual" | "person" | "organization" | "relationship" | "interaction" | "project";
export type TaskDueFilter = "overdue" | "today" | "week";
export type ProjectType = "recruitment" | "property_sale" | "rental_management" | "partnership" | "training" | "referral" | "other";
export type ProjectStatus = "open" | "won" | "lost";
export type ProjectStage = "new" | "qualification" | "proposal" | "decision";
export type ProjectLossReason = "price" | "competition" | "abandoned" | "too_long" | "no_response" | "bad_qualification" | "conditions_rejected" | "other";
export type ActionPlanSourceType = "task" | "relationship_recommendation";
export type ActionPlanCategory = "critical" | "priority" | "opportunity" | "to_schedule";
export type ActionPlanPrimaryAction = "complete" | "snooze" | "schedule" | "open" | "create_task" | "add_interaction";
export type ActionPlanReasonCode =
  | "TASK_OVERDUE_GT_24H"
  | "TASK_OVERDUE_LT_24H"
  | "DUE_TODAY"
  | "HIGH_PRIORITY"
  | "MEDIUM_PRIORITY"
  | "SNOOZED"
  | "SNOOZED_MULTIPLE_TIMES"
  | "RELATIONSHIP_INACTIVE_14D"
  | "RELATIONSHIP_INACTIVE_30D"
  | "IMPORTANT_WITHOUT_DUE_DATE";
export type ActionPlanDecisionType = "ignored" | "snoozed" | "converted_to_task" | "completed";
export type RelationshipPipelineStage =
  | "detection"
  | "qualification"
  | "first_contact"
  | "conversation"
  | "appointment"
  | "presentation"
  | "reflection"
  | "negotiation"
  | "signature"
  | "onboarding"
  | "development"
  | "ambassador"
  | "rejected";
export type RelationshipRejectionReason =
  | "not_interested"
  | "conditions"
  | "current_network"
  | "postponed"
  | "profile_mismatch"
  | "unresponsive"
  | "duplicate"
  | "other";
export type TimelineEventType =
  | "person_created"
  | "organization_created"
  | "relationship_created"
  | "interaction_created"
  | "interaction_updated"
  | "task_created"
  | "task_completed"
  | "task_reopened"
  | "task_updated"
  | "task_deleted"
  | "organization_linked"
  | "organization_unlinked"
  | "project_created"
  | "project_stage_changed"
  | "project_owner_changed"
  | "project_estimated_value_changed"
  | "project_expected_close_changed"
  | "project_won"
  | "project_lost"
  | "project_reopened"
  | "project_archived"
  | "project_reactivated"
  | "project_task_created"
  | "project_task_completed"
  | "project_interaction_created"
  | "relationship_stage_changed"
  | "relationship_signature_confirmed"
  | "relationship_rejected"
  | "relationship_reopened"
  | "relationship_owner_changed"
  | "relationship_do_not_contact_changed";
export type TimelineSourceType = "person" | "organization" | "relationship" | "interaction" | "task" | "project";
export type TimelineVisibility = "tenant";

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
  pipeline_stage: RelationshipPipelineStage;
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

export type RecruitmentPipelineEvent = TenantScoped & {
  id: string;
  relationship_id: string;
  from_stage: RelationshipPipelineStage | null;
  to_stage: RelationshipPipelineStage;
  event_type: "stage_transition" | "signature_confirmed" | "signature_left" | "rejected" | "reopened" | "owner_changed" | "do_not_contact_changed";
  actor_user_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
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
  project_id?: string | null;
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
  project_id?: string | null;
  source_type: TaskSourceType | null;
  source_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  snoozed_until: string | null;
  snooze_count: number;
  last_snoozed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Project = TenantScoped & {
  id: string;
  title: string;
  short_description: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  stage: ProjectStage;
  owner_user_id: string;
  created_by: string | null;
  organization_id: string | null;
  person_id: string | null;
  relationship_id: string | null;
  estimated_value: string | null;
  final_value: string | null;
  currency: string;
  expected_close_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  loss_reason: ProjectLossReason | null;
  closing_note: string | null;
  archived_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ActionPlanDecision = TenantScoped & {
  id: string;
  organization_id: string;
  user_id: string;
  recommendation_key: string;
  decision_type: ActionPlanDecisionType;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionPlanReason = {
  code: ActionPlanReasonCode;
  weight: number;
  metadata?: Record<string, number | string | boolean | null>;
};

export type ActionPlanItem = {
  id: string;
  sourceType: ActionPlanSourceType;
  sourceId: string;
  title: string;
  description: string | null;
  category: ActionPlanCategory;
  score: number;
  reasons: ActionPlanReason[];
  dueAt: string | null;
  completedAt: string | null;
  snoozedUntil: string | null;
  snoozeCount: number;
  personId: string | null;
  organizationId: string | null;
  relationshipId: string | null;
  primaryAction: ActionPlanPrimaryAction;
  availableActions: ActionPlanPrimaryAction[];
  createdAt: string;
};

export type TimelineEvent = TenantScoped & {
  id: string;
  event_type: TimelineEventType;
  title: string;
  description: string | null;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
  person_id: string | null;
  organization_id: string | null;
  relationship_id: string | null;
  interaction_id: string | null;
  task_id: string | null;
  project_id?: string | null;
  source_type: TimelineSourceType;
  source_id: string;
  metadata: Record<string, unknown>;
  visibility: TimelineVisibility;
  deleted_at: string | null;
  idempotency_key: string;
};

export type TenantContext = {
  tenantId: string;
  tenant: { id: string; name: string };
  userId: string;
  role: RoleSlug;
};
