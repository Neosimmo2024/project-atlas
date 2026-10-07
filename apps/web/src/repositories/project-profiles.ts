import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Person, Project, TenantContext } from "@/types/domain";

export async function listProjectProfiles(context: TenantContext, project: Project): Promise<Person[]> {
  const selection = project.metadata.people_selection ?? project.metadata.lyon_development;
  if (!selection || typeof selection !== "object" || !("person_ids" in selection)) return [];
  const ids = (selection as { person_ids?: unknown }).person_ids;
  if (!Array.isArray(ids)) return [];
  const personIds = [...new Set(ids.filter((id): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))].slice(0, 200);
  if (!personIds.length) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("people").select("*").eq("tenant_id", context.tenantId).in("id", personIds);
  if (error) throw error;
  const people = new Map(((data ?? []) as Person[]).map((person) => [person.id, person]));
  return personIds.flatMap((id) => people.has(id) ? [people.get(id)!] : []);
}
