import { z } from "zod";

const source = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Indiquez un lien public http ou https.");
export const reviewSchema = z.object({
  listId: z.string().uuid(), siret: z.string().regex(/^\d{14}$/),
  status: z.enum(["pending", "qualified", "rejected"]),
  kind: z.enum(["unknown", "mandataire", "agence"]),
  firstName: z.string().trim().max(80).default(""),
  lastName: z.string().trim().max(80).default(""),
  email: z.string().trim().max(254).email().or(z.literal("")),
  phone: z.string().trim().transform(v => v.replace(/[\s().-]/g, ""))
    .refine(v => !v || /^(?:\+[1-9]\d{7,14}|0\d{9})$/.test(v), "Indiquez un numéro français ou international valide."),
  sourceUrl: source,
  linkedinUrl: source.refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === "https:" && /^(?:[a-z]{2,3}\.)?linkedin\.com$/.test(url.hostname) && /^\/in\/[^/]+\/?$/.test(url.pathname) && !url.port; }
    catch { return false; }
  }, "Indiquez une URL de profil LinkedIn https://www.linkedin.com/in/…").default(""),
  linkedinStatus: z.enum(["not_checked", "not_found", "unavailable", "consistent", "conflict"]).default("not_checked"),
  linkedinRole: z.string().trim().max(200).default(""),
  linkedinNetwork: z.string().trim().max(200).default(""),
  linkedinArea: z.string().trim().max(200).default(""),
  linkedinEvidence: z.string().trim().max(1000).default(""),
  linkedinCheckedOn: z.string().date().or(z.literal("")).default(""),
  notes: z.string().trim().max(2000)
}).superRefine((value, ctx) => {
  if (value.linkedinStatus !== "not_checked" && !value.linkedinCheckedOn) {
    ctx.addIssue({ code: "custom", path: ["linkedinCheckedOn"], message: "Datez le contrôle LinkedIn." });
  }
  if (["consistent", "conflict"].includes(value.linkedinStatus) && (!value.linkedinUrl || !value.linkedinEvidence)) {
    ctx.addIssue({ code: "custom", path: ["linkedinEvidence"], message: "Ajoutez le profil et les faits observés." });
  }
  if (value.linkedinStatus === "consistent" && (!value.linkedinRole || !value.linkedinArea)) {
    ctx.addIssue({ code: "custom", path: ["linkedinRole"], message: "Renseignez l’activité et le secteur observés." });
  }
  if (value.status === "qualified" && value.linkedinStatus === "conflict") {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Résolvez la contradiction LinkedIn avant de retenir le prospect." });
  }
  if ((value.email || value.phone || value.status === "qualified") && !value.sourceUrl) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "La source des coordonnées est obligatoire." });
  }
  if (value.status === "qualified" && (value.kind === "unknown" || !(value.email || value.phone))) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Confirmez l’activité et au moins une coordonnée avant de retenir ce prospect." });
  }
});
