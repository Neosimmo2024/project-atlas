import nodemailer from "nodemailer";
import type { TenantContext } from "@/types/domain";
import { canManageIonos } from "./ionos-connection";

export const LFI_BREVO_SENDER = "contact@lesformateursimmo.com";
const HOST = "smtp-relay.brevo.com";

export function canManageLfiEmail(context: TenantContext) {
  return canManageIonos(context);
}

export function brevoSmtpStatus(context: TenantContext) {
  if (!canManageLfiEmail(context)) return null;
  return {
    sender: LFI_BREVO_SENDER,
    configured: Boolean(process.env.LFI_BREVO_SMTP_PASSWORD),
    campaignsEnabled: false as const
  };
}

/** Authentication diagnostic only. Never submits an email. */
export async function verifyBrevoSmtpConnection(context: TenantContext) {
  if (!canManageLfiEmail(context)) return { success: false, error: "Accès non autorisé." };
  const password = process.env.LFI_BREVO_SMTP_PASSWORD;
  if (!password) return { success: false, error: "La connexion SMTP Brevo doit encore être configurée par l’administrateur technique." };
  const transport = createBrevoSmtpTransport(password);
  try {
    await transport.verify();
    return { success: true, message: "Connexion SMTP à Brevo vérifiée. Aucun email envoyé." };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
    return { success: false, error: code === "EAUTH"
      ? "Brevo refuse l’authentification SMTP. Vérifiez la clé SMTP configurée."
      : "Connexion SMTP à Brevo impossible. Vérifiez la disponibilité du service et réessayez." };
  } finally {
    transport.close();
  }
}

export function createBrevoSmtpTransport(password: string) {
  return nodemailer.createTransport({
    host: HOST,
    port: 587,
    secure: false,
    requireTLS: true,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, servername: HOST },
    auth: { user: LFI_BREVO_SENDER, pass: password },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true
  });
}
