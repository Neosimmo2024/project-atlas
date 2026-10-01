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
  notes: z.string().trim().max(2000)
}).superRefine((value, ctx) => {
  if ((value.email || value.phone || value.status === "qualified") && !value.sourceUrl) {
    ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "La source des coordonnées est obligatoire." });
  }
  if (value.status === "qualified" && (value.kind === "unknown" || !(value.email || value.phone))) {
    ctx.addIssue({ code: "custom", path: ["status"], message: "Confirmez l’activité et au moins une coordonnée avant de retenir ce prospect." });
  }
});
