import { createSupabaseServerClient } from "@/lib/supabase/server";
import { previewCsvImport, type CsvImportRequest, type CsvImportAtlasData, type CsvImportPreviewResult } from "@/features/csv-import/csv-import";
import type { TenantContext } from "@/types/domain";

export async function previewTenantCsvImport(context: TenantContext, request: CsvImportRequest): Promise<CsvImportPreviewResult> {
  const atlas = await loadCsvImportAtlasData(context);
  return previewCsvImport(request, atlas, context);
}

async function loadCsvImportAtlasData(context: TenantContext): Promise<CsvImportAtlasData> {
  const supabase = await createSupabaseServerClient();

  const [{ data: people, error: peopleError }, { data: organizations, error: organizationsError }, { data: tenantUsers, error: tenantUsersError }] = await Promise.all([
    supabase
      .from("people")
      .select("id, tenant_id, first_name, last_name, display_name, primary_email, primary_phone, city, postal_code, source, comments, do_not_contact")
      .eq("tenant_id", context.tenantId)
      .order("id", { ascending: true })
      .limit(10000),
    supabase
      .from("organizations")
      .select("id, tenant_id, name, siren, siret, primary_email, primary_phone, city, postal_code, status, vat_status, do_not_contact")
      .eq("tenant_id", context.tenantId)
      .order("id", { ascending: true })
      .limit(10000),
    supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", context.tenantId)
      .eq("status", "active")
      .order("user_id", { ascending: true })
      .limit(500)
  ]);

  if (peopleError) throw peopleError;
  if (organizationsError) throw organizationsError;
  if (tenantUsersError) throw tenantUsersError;

  const userIds = (tenantUsers ?? []).map((row) => row.user_id as string);
  let profiles: Array<{ id: string; full_name: string | null; email: string | null }> = [];

  if (userIds.length > 0) {
    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds)
      .limit(500);

    if (profilesError) throw profilesError;
    profiles = (profileRows ?? []) as typeof profiles;
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const owners = userIds.map((userId) => {
    const profile = profileById.get(userId);
    return {
      userId,
      label: profile?.full_name || profile?.email || (userId === context.userId ? "Utilisateur courant" : `Utilisateur ${userId.slice(0, 8)}`),
      email: profile?.email ?? null
    };
  });

  return {
    people: (people ?? []) as CsvImportAtlasData["people"],
    organizations: (organizations ?? []) as CsvImportAtlasData["organizations"],
    owners
  };
}
