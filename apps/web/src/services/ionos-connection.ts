import nodemailer from "nodemailer";
import type { TenantContext } from "@/types/domain";

export const IONOS_SENDER = "contact@lesformateursimmo.com";
const HOST = "smtp.ionos.fr";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function canManageIonos(context: TenantContext) {
  const tenantId = process.env.LFI_IONOS_TENANT_ID?.trim();
  return !!tenantId && UUID.test(tenantId) && context.tenantId === tenantId &&
    (context.role === "owner" || context.role === "admin");
}

export function ionosConnectionStatus(context: TenantContext) {
  if (!canManageIonos(context)) return null;
  return {
    sender: IONOS_SENDER,
    configured: Boolean(process.env.LFI_IONOS_SMTP_PASSWORD),
    campaignsEnabled: false as const
  };
}

/** Connection/authentication diagnostic only. Never submits an email. */
export async function verifyIonosConnection(context: TenantContext) {
  if (!canManageIonos(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.LFI_IONOS_SMTP_PASSWORD;
  if (!password) return { success: false, error: "La connexion IONOS doit encore être configurée par l’administrateur technique." };
  // Fixed destination and identity: neither can be supplied by the client.
  const transport = nodemailer.createTransport({
    host: HOST,
    port: 465,
    secure: true,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: HOST },
    auth: { user: IONOS_SENDER, pass: password },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true
  });
  try {
    await transport.verify();
    return { success: true, message: "Connexion à IONOS vérifiée. Aucun email envoyé. La réception des messages reste à tester avant les campagnes." };
  } catch (error) {
    // SMTP errors may contain credentials or server dialogue: never log/return them.
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
    return { success: false, error: code === "EAUTH"
      ? "IONOS refuse l’authentification. Vérifiez les identifiants de la boîte contact."
      : "Connexion à IONOS impossible. Vérifiez la disponibilité du service et réessayez." };
  } finally {
    transport.close();
  }
}
