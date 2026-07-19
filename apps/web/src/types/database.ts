import type { ActionPlanDecision, Interaction, InteractionType, Organization, Person, Project, RecruitmentPipelineEvent, Relationship, Task, TimelineEvent } from "@/types/domain";

type Timestamped = { id: string; tenant_id: string; created_at: string; updated_at: string };
type Row<T> = T & Record<string, unknown>;
type Insert<T extends Timestamped> = Partial<Omit<T, "id" | "tenant_id" | "created_at" | "updated_at">> &
  Pick<T, "tenant_id"> &
  Partial<Pick<T, "id">>;
type Update<T extends Timestamped> = Partial<Insert<T>>;
type TimelineEventInsert = Partial<Omit<TimelineEvent, "id" | "tenant_id" | "created_at">> &
  Pick<TimelineEvent, "tenant_id" | "event_type" | "title" | "source_type" | "source_id" | "idempotency_key"> &
  Partial<Pick<TimelineEvent, "id">>;
type RecruitmentPipelineEventInsert = Partial<Omit<RecruitmentPipelineEvent, "id" | "tenant_id" | "created_at">> &
  Pick<RecruitmentPipelineEvent, "tenant_id" | "relationship_id" | "to_stage"> &
  Partial<Pick<RecruitmentPipelineEvent, "id">>;
type NoRelationships = [];
type TenantRow = {
  id: string;
  name: string;
  status: "active" | "suspended" | "archived";
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;
type TenantInsert = {
  name: string;
  status?: "active" | "suspended" | "archived";
};
type TenantUserRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string;
  status: "active" | "invited" | "suspended";
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;
type TenantUserInsert = {
  tenant_id: string;
  user_id: string;
  role_id: string;
  status?: "active" | "invited" | "suspended";
};
type RoleRow = {
  id: string;
  slug: "owner" | "admin" | "recruiter" | "manager" | "reader";
  label: string;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;
type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
} & Record<string, unknown>;

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: TenantRow;
        Insert: TenantInsert;
        Update: Partial<TenantInsert>;
        Relationships: NoRelationships;
      };
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow>; Relationships: NoRelationships };
      people: { Row: Row<Person>; Insert: Insert<Person>; Update: Update<Person>; Relationships: NoRelationships };
      organizations: { Row: Row<Organization>; Insert: Insert<Organization>; Update: Update<Organization>; Relationships: NoRelationships };
      interaction_types: { Row: Row<InteractionType>; Insert: Partial<InteractionType>; Update: Partial<InteractionType>; Relationships: NoRelationships };
      interactions: {
        Row: Row<Interaction>;
        Insert: Insert<Interaction>;
        Update: Update<Interaction>;
        Relationships: [
          {
            foreignKeyName: "interactions_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interactions_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interactions_relationship_id_fkey";
            columns: ["relationship_id"];
            referencedRelation: "relationships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "interactions_type_id_fkey";
            columns: ["type_id"];
            referencedRelation: "interaction_types";
            referencedColumns: ["id"];
          }
        ];
      };
      tasks: {
        Row: Row<Task>;
        Insert: Insert<Task>;
        Update: Update<Task>;
        Relationships: [
          {
            foreignKeyName: "tasks_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_relationship_id_fkey";
            columns: ["relationship_id"];
            referencedRelation: "relationships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_interaction_id_fkey";
            columns: ["interaction_id"];
            referencedRelation: "interactions";
            referencedColumns: ["id"];
          }
        ];
      };
      projects: {
        Row: Row<Project>;
        Insert: Insert<Project>;
        Update: Update<Project>;
        Relationships: [
          {
            foreignKeyName: "projects_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_relationship_id_fkey";
            columns: ["relationship_id"];
            referencedRelation: "relationships";
            referencedColumns: ["id"];
          }
        ];
      };
      action_plan_decisions: {
        Row: Row<ActionPlanDecision>;
        Insert: Insert<ActionPlanDecision>;
        Update: Update<ActionPlanDecision>;
        Relationships: [
          {
            foreignKeyName: "action_plan_decisions_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_plan_decisions_tenant_organization_fkey";
            columns: ["tenant_id", "organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["tenant_id", "id"];
          }
        ];
      };
      recruitment_pipeline_events: {
        Row: Row<RecruitmentPipelineEvent>;
        Insert: RecruitmentPipelineEventInsert;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "recruitment_pipeline_events_relationship_id_fkey";
            columns: ["relationship_id"];
            referencedRelation: "relationships";
            referencedColumns: ["id"];
          }
        ];
      };
      timeline_events: {
        Row: Row<TimelineEvent>;
        Insert: TimelineEventInsert;
        Update: Partial<TimelineEventInsert>;
        Relationships: [
          {
            foreignKeyName: "timeline_events_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timeline_events_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timeline_events_relationship_id_fkey";
            columns: ["relationship_id"];
            referencedRelation: "relationships";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timeline_events_interaction_id_fkey";
            columns: ["interaction_id"];
            referencedRelation: "interactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timeline_events_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          }
        ];
      };
      relationships: {
        Row: Row<Relationship>;
        Insert: Insert<Relationship>;
        Update: Update<Relationship>;
        Relationships: [
          {
            foreignKeyName: "relationships_person_id_fkey";
            columns: ["person_id"];
            referencedRelation: "people";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "relationships_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      tenant_users: {
        Row: TenantUserRow;
        Insert: TenantUserInsert;
        Update: Partial<TenantUserInsert>;
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey";
            columns: ["tenant_id"];
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_users_role_id_fkey";
            columns: ["role_id"];
            referencedRelation: "roles";
            referencedColumns: ["id"];
          }
        ];
      };
      roles: {
        Row: RoleRow;
        Insert: never;
        Update: never;
        Relationships: NoRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      transition_recruitment_pipeline: {
        Args: {
          p_relationship_id: string;
          p_tenant_id: string;
          p_to_stage: string;
          p_expected_stage?: string | null;
          p_expected_updated_at?: string | null;
          p_confirmed?: boolean;
          p_reason?: string | null;
          p_signature_at?: string | null;
          p_start_at?: string | null;
          p_rejection_reason?: string | null;
          p_rejection_comment?: string | null;
          p_rejection_recontactable?: boolean | null;
          p_rejection_follow_up_at?: string | null;
          p_do_not_contact?: boolean | null;
          p_metadata?: Record<string, unknown>;
        };
        Returns: Row<Relationship>;
      };
      assign_relationship_owner: {
        Args: {
          p_relationship_id: string;
          p_tenant_id: string;
          p_owner_user_id: string | null;
          p_expected_updated_at?: string | null;
          p_reason?: string | null;
        };
        Returns: Row<Relationship>;
      };
      set_relationship_do_not_contact: {
        Args: {
          p_relationship_id: string;
          p_tenant_id: string;
          p_do_not_contact: boolean;
          p_justification: string;
          p_expected_updated_at?: string | null;
        };
        Returns: Row<Relationship>;
      };
    };
    Enums: Record<string, never>;
  };
};
