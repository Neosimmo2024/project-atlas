import { z } from "zod";

export const marketingSnapshotSchema = z.object({
  key: z.literal("bordeaux-marketing-20261023"), project_id: z.string().uuid(),
  template_ids: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  first_name: z.string(), days: z.tuple([z.literal(0), z.literal(15), z.literal(30)])
});
export function isMarketingSnapshot(value: unknown) {
  return typeof value === "object" && value !== null && "key" in value && value.key === "bordeaux-marketing-20261023";
}
/** Calendar days and a fixed Paris clock, including Sundays and DST changes. */
export function parisFollowUpAt(sentAt: string, days: number, hour = 12, minute = 15) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = (at: number) => { const p = formatter.formatToParts(new Date(at)); return (key: string) => Number(p.find(v => v.type === key)!.value); };
  const p = parts(Date.parse(sentAt));
  const target = Date.UTC(p("year"), p("month") - 1, p("day") + days, hour, minute);
  let instant = target;
  for (let i = 0; i < 2; i++) { const q = parts(instant); instant += target - Date.UTC(q("year"), q("month") - 1, q("day"), q("hour"), q("minute")); }
  return new Date(instant).toISOString();
}
