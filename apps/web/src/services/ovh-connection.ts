import nodemailer from "nodemailer";
import type { TenantContext } from "@/types/domain";

export const OVH_SENDER = "contact@vendresoncommerce.com";
const HOST = "ssl0.ovh.net";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canManageOvh(context: TenantContext) {
  const tenantId = process.env.VSC_OVH_TENANT_ID?.trim();
  return !!tenantId && UUID.test(tenantId) && context.tenantId === tenantId &&
    (context.role === "owner" || context.role === "admin");
}

export function ovhConnectionStatus(context: TenantContext) {
  if (!canManageOvh(context)) return null;
  return {
    sender: OVH_SENDER,
    configured: Boolean(process.env.VSC_OVH_SMTP_PASSWORD),
    campaignsEnabled: false as const
  };
}

/** Connection/authentication diagnostic only. Never submits an email. */
export async function verifyOvhConnection(context: TenantContext) {
  if (!canManageOvh(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.VSC_OVH_SMTP_PASSWORD;
  if (!password) return { success: false, error: "La connexion OVH doit encore être configurée par l’administrateur technique." };
  // Fixed destination and identity: neither can be supplied by the client.
  const transport = createOvhTransport(password);
  try {
    await transport.verify();
    return { success: true, message: "Connexion à OVH vérifiée. Aucun email envoyé. La réception des messages reste à tester avant les campagnes." };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
    return { success: false, error: code === "EAUTH"
      ? "OVH refuse l’authentification. Vérifiez les identifiants de la boîte contact."
      : "Connexion à OVH impossible. Vérifiez la disponibilité du service et réessayez." };
  } finally {
    transport.close();
  }
}

export function createOvhTransport(password: string) {
  return nodemailer.createTransport({
    host: HOST,
    port: 465,
    secure: true,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: HOST },
    auth: { user: OVH_SENDER, pass: password },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true
  });
}
