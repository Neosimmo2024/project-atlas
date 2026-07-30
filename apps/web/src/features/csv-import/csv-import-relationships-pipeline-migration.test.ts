import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "..", "..", "supabase", "migrations", "0013_csv_import_relationships_pipeline.sql"),
  "utf8"
);

describe("CSV import relationships and pipeline migration", () => {
  it("adds the global pipeline option to the execution RPC without exposing public execution", () => {
    expect(migration).toContain("p_add_to_pipeline boolean");
    expect(migration).toContain("'pipelineIntegrationEnabled', p_add_to_pipeline is true");
    expect(migration).toContain("revoke execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean) from public, anon");
    expect(migration).toContain("grant execute on function public.execute_csv_import(uuid, text, text, text, jsonb, uuid, boolean) to authenticated, service_role");
  });

  it("creates only recruiting relationships in the detection stage when person and organization are known", () => {
    expect(migration).toContain("relationship_type,");
    expect(migration).toContain("pipeline_stage,");
    expect(migration).toContain("'recruiting'");
    expect(migration).toContain("'detection'");
    expect(migration).toContain("owner_user_id,");
    expect(migration).toContain("v_relationship.owner_user_id is not null");
    expect(migration).toContain("'missing_organization'");
    expect(migration).toContain("'missing_person'");
  });

  it("links existing recruiting relationships and skips different active relationship types", () => {
    expect(migration).toContain("and relationship_type = 'recruiting'");
    expect(migration).toContain("and relationship_type <> 'recruiting'");
    expect(migration).toContain("'existing_relationship'");
    expect(migration).toContain("'different_type_exists'");
    expect(migration).toContain("'relationshipCreated', v_relationship_created");
  });

  it("cancels relationships before recalculating people and organizations", () => {
    const deleteRelationshipIndex = migration.indexOf("delete from public.relationships");
    const recalculateIndex = migration.indexOf("v_analysis := public._csv_import_created_entity_report(p_tenant_id, p_import_run_id);", deleteRelationshipIndex);
    const deletePeopleIndex = migration.indexOf("delete from public.people", deleteRelationshipIndex);
    expect(deleteRelationshipIndex).toBeGreaterThan(-1);
    expect(recalculateIndex).toBeGreaterThan(deleteRelationshipIndex);
    expect(deletePeopleIndex).toBeGreaterThan(recalculateIndex);
  });

  it("keeps modified or business-linked imported relationships instead of deleting them", () => {
    expect(migration).toContain("'phase_modifiee_apres_import'");
    expect(migration).toContain("'statut_modifie_apres_import'");
    expect(migration).toContain("'responsable_modifie'");
    expect(migration).toContain("dependance_pipeline_event");
    expect(migration).toContain("dependance_task");
    expect(migration).toContain("dependance_interaction");
    expect(migration).toContain("dependance_project");
    expect(migration).toContain("utilisee_par_un_autre_import");
  });

  it("extends cancellation counters and reports relationships separately", () => {
    expect(migration).toContain("relationships_deleted integer not null default 0");
    expect(migration).toContain("relationships_kept integer not null default 0");
    expect(migration).toContain("'relationshipsDeleted', v_relationships_deleted_count");
    expect(migration).toContain("'relationshipsKept', v_relationships_kept_count");
    expect(migration).toContain("'relationshipsCreated', jsonb_array_length(v_relationship_traces)");
  });
});
