import { z } from "zod";

export const LYON_SENDER = "renato.ponzio@neos-immo.com";
const ids = z.tuple([z.string().uuid(), z.string().uuid(), z.string().uuid()]);
const templates = z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]);
export const lyonCampaignSchema = z.object({
  state: z.enum(["draft", "ready"]),
  launch_enabled: z.boolean().default(false),
  version_ids: ids,
  recipient_ids: z.array(z.string().uuid()).min(1),
  template_ids: templates.optional(),
  pending_template_ids: z.array(z.number().int().positive()).max(3).optional(),
  prepared_at: z.string().optional(),
  sender_verified: z.boolean().optional()
});
export type LyonCampaign = z.infer<typeof lyonCampaignSchema>;
export const lyonSnapshotSchema = z.object({
  key: z.literal("lyon-development"), project_id: z.string().uuid(),
  version_ids: ids, template_ids: templates,
  days: z.tuple([z.literal(0), z.literal(17), z.literal(32)])
});
export type LyonSnapshot = z.infer<typeof lyonSnapshotSchema>;

export function isLyonCampaignReady(campaign: LyonCampaign | null) {
  return Boolean(campaign?.state === "ready" && campaign.template_ids && campaign.sender_verified);
}

export function canLaunchLyon(campaign: LyonCampaign | null, personId: string) {
  return isLyonCampaignReady(campaign) && campaign!.launch_enabled && campaign!.recipient_ids.includes(personId);
}

export function makeLyonSnapshot(projectId: string, campaign: LyonCampaign): LyonSnapshot {
  return lyonSnapshotSchema.parse({ key: "lyon-development", project_id: projectId,
    version_ids: campaign.version_ids, template_ids: campaign.template_ids, days: [0, 17, 32] });
}
