export type BrevoContactPayload = {
  tenantId: string;
  personId: string;
  email?: string | null;
  phone?: string | null;
};

export async function prepareBrevoContact(_payload: BrevoContactPayload) {
  return {
    prepared: true,
    sent: false,
    reason: "Brevo automations are intentionally out of scope for this ticket."
  };
}
