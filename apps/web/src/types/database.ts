import type { Organization, Person, Relationship } from "@/types/domain";

type Row<T> = T;
type Insert<T> = Omit<T, "id" | "created_at" | "updated_at"> & Partial<Pick<T, "id">>;
type Update<T> = Partial<Insert<T>>;

export type Database = {
  public: {
    Tables: {
      people: { Row: Row<Person>; Insert: Insert<Person>; Update: Update<Person> };
      organizations: { Row: Row<Organization>; Insert: Insert<Organization>; Update: Update<Organization> };
      relationships: { Row: Row<Relationship>; Insert: Insert<Relationship>; Update: Update<Relationship> };
      tenant_users: {
        Row: { id: string; tenant_id: string; user_id: string; role_id: string; status: "active" | "invited" | "suspended"; created_at: string; updated_at: string };
        Insert: { tenant_id: string; user_id: string; role_id: string; status?: "active" | "invited" | "suspended" };
        Update: Partial<Database["public"]["Tables"]["tenant_users"]["Insert"]>;
      };
      roles: {
        Row: { id: string; slug: "owner" | "admin" | "recruiter" | "manager" | "reader"; label: string; created_at: string; updated_at: string };
        Insert: never;
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
