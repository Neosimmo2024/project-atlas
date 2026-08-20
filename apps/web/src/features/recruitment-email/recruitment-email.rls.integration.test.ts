import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const requiredEnv = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "PEOPLE_TEST_TENANT_A_EMAIL", "PEOPLE_TEST_TENANT_A_PASSWORD",
  "PEOPLE_TEST_TENANT_B_EMAIL", "PEOPLE_TEST_TENANT_B_PASSWORD"
] as const;
const describeIntegration = requiredEnv.every((key) => Boolean(process.env[key])) ? describe : describe.skip;
const marker = `recruitment-email-rls-${Date.now()}`;

async function userClient(email: string, password: string) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function tenantId(client: SupabaseClient) {
  const { data, error } = await client.from("tenant_users").select("tenant_id").eq("status", "active").limit(1).single();
  if (error) throw error;
  return data.tenant_id as string;
}

describeIntegration("recruitment email sequence RLS", () => {
  let tenantA: SupabaseClient;
  let tenantB: SupabaseClient;
  let tenantAId: string;
  let tenantBId: string;
  let personAId: string;
  let personBId: string;

  beforeAll(async () => {
    tenantA = await userClient(process.env.PEOPLE_TEST_TENANT_A_EMAIL!, process.env.PEOPLE_TEST_TENANT_A_PASSWORD!);
    tenantB = await userClient(process.env.PEOPLE_TEST_TENANT_B_EMAIL!, process.env.PEOPLE_TEST_TENANT_B_PASSWORD!);
    tenantAId = await tenantId(tenantA); tenantBId = await tenantId(tenantB);
    const a = await tenantA.from("people").insert({ tenant_id: tenantAId, display_name: `${marker} A`, primary_email: "a@example.fr", status: "to_qualify", priority: "medium", contact_allowed: true, do_not_contact: false }).select("id").single();
    const b = await tenantB.from("people").insert({ tenant_id: tenantBId, display_name: `${marker} B`, primary_email: "b@example.fr", status: "to_qualify", priority: "medium", contact_allowed: true, do_not_contact: false }).select("id").single();
    if (a.error) throw a.error; if (b.error) throw b.error;
    personAId = a.data.id as string; personBId = b.data.id as string;
  });

  afterAll(async () => {
    await tenantA?.from("people").delete().eq("id", personAId);
    await tenantB?.from("people").delete().eq("id", personBId);
  });

  it("creates one tenant-scoped claim and returns the same reservation", async () => {
    const first = await tenantA.rpc("claim_initial_recruitment_email", { p_person_id: personAId });
    const second = await tenantA.rpc("claim_initial_recruitment_email", { p_person_id: personAId });
    expect(first.error).toBeNull(); expect(second.error).toBeNull();
    expect(second.data.id).toBe(first.data.id);
    expect(first.data.tenant_id).toBe(tenantAId);
  });

  it("prevents cross-tenant claims and reads", async () => {
    const claim = await tenantA.rpc("claim_initial_recruitment_email", { p_person_id: personBId });
    expect(claim.error).not.toBeNull();
    const read = await tenantA.from("recruitment_email_sequences").select("id").eq("person_id", personBId);
    expect(read.error).toBeNull(); expect(read.data).toHaveLength(0);
  });

  it("rejects direct browser writes", async () => {
    const insert = await tenantA.from("recruitment_email_sequences").insert({
      tenant_id: tenantAId, person_id: personAId, email: "fake@example.fr", created_by: "00000000-0000-0000-0000-000000000000", updated_by: "00000000-0000-0000-0000-000000000000"
    });
    expect(insert.error).not.toBeNull();
  });

  it("versions and activates the tenant Brevo template through guarded RPCs only", async () => {
    const created = await tenantA.rpc("create_recruitment_email_template_version", {
      p_tenant_id: tenantAId,
      p_template_name: `${marker} template`,
      p_subject: "Bonjour {{ params.PRENOM }}",
      p_preview_text: "Aperçu",
      p_headline: "Une autre vision de l’immobilier",
      p_body_text: "Bonjour {{ params.PRENOM }}, ceci est un contenu de test suffisamment long.",
      p_signature_name: "Renato Ponzio",
      p_signature_title: "Président de NEOS IMMO",
      p_sender_name: "NEOS IMMO",
      p_sender_email: "contact@neos-immo.com",
      p_reply_to: "contact@neos-immo.com",
      p_brand_color: "#0B3D3B",
      p_html_content: "<html><body><p>Bonjour {{ params.PRENOM }}, contenu de test sécurisé.</p></body></html>"
    });
    expect(created.error).toBeNull();
    expect(created.data.tenant_id).toBe(tenantAId);
    expect(created.data.status).toBe("draft");

    const crossTenantRead = await tenantB.from("recruitment_email_template_versions").select("id").eq("id", created.data.id);
    expect(crossTenantRead.error).toBeNull();
    expect(crossTenantRead.data).toHaveLength(0);

    const directUpdate = await tenantA.from("recruitment_email_template_versions").update({ status: "active" }).eq("id", created.data.id);
    expect(directUpdate.error).not.toBeNull();

    const activated = await tenantA.rpc("activate_recruitment_email_template_version", {
      p_version_id: created.data.id,
      p_brevo_template_id: 501
    });
    expect(activated.error).toBeNull();
    expect(activated.data).toMatchObject({ status: "active", brevo_template_id: 501 });
  });
});
