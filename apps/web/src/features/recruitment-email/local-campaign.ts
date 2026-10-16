import { z } from "zod";

export const LOCAL_CAMPAIGN_KEY = "saint-maur-local-20261016";
export const LOCAL_REVIEW_KEY = "local_sequence_review_20261016";
export const LOCAL_SENDER = "renato.ponzio@neos-immo.com";
export const localSnapshotSchema = z.object({
  key: z.literal(LOCAL_CAMPAIGN_KEY), project_id: z.string().uuid(),
  content_hash: z.string().length(64),
  template_ids: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  first_name: z.string(), city: z.string().min(1),
  days: z.tuple([z.literal(0), z.literal(10), z.literal(20)])
});
export type LocalSnapshot = z.infer<typeof localSnapshotSchema>;
export function isLocalSnapshot(snapshot: unknown) {
  return typeof snapshot === "object" && snapshot !== null && "key" in snapshot && snapshot.key === LOCAL_CAMPAIGN_KEY;
}

// Keep 09:30 Paris across the October DST transition. Sunday is deferred to Monday.
export function localFollowUpAt(sentAt: string, days: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(sentAt));
  const part = (type: string) => Number(parts.find(p => p.type === type)!.value);
  const calendar = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + days, 9, 30));
  if (calendar.getUTCDay() === 0) calendar.setUTCDate(calendar.getUTCDate() + 1);
  const target = calendar.getTime();
  let instant = target;
  for (let i = 0; i < 2; i++) {
    const local = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
    const n = (type: string) => Number(local.find(p => p.type === type)!.value);
    instant += target - Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
  }
  return new Date(instant).toISOString();
}
