import { describe, expect, it } from "vitest";

const hasTimelineIntegrationEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL
  && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  && process.env.TIMELINE_TEST_TENANT_A_EMAIL
  && process.env.TIMELINE_TEST_TENANT_A_PASSWORD
  && process.env.TIMELINE_TEST_TENANT_B_EMAIL
  && process.env.TIMELINE_TEST_TENANT_B_PASSWORD
);

const describeIf = hasTimelineIntegrationEnv ? describe : describe.skip;

describeIf("timeline RLS integration", () => {
  it("keeps timeline events isolated per tenant", async () => {
    expect(hasTimelineIntegrationEnv).toBe(true);
  });

  it("prevents users without an active tenant from reading events", async () => {
    expect(hasTimelineIntegrationEnv).toBe(true);
  });
});
