export const INTERACTION_TYPE_SLUGS = [
  "call",
  "video",
  "in_person",
  "email",
  "sms",
  "whatsapp",
  "coaching",
  "training",
  "meeting",
  "note"
] as const;

export const INTERACTION_TYPE_LABELS: Record<(typeof INTERACTION_TYPE_SLUGS)[number], string> = {
  call: "Appel",
  video: "Visio",
  in_person: "Presentiel",
  email: "Mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
  coaching: "Coaching",
  training: "Formation",
  meeting: "Reunion",
  note: "Note"
};
