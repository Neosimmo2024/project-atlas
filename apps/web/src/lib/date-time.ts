/** Shared wall-clock policy for the French pilot, independent of server/browser TZ. */
export const ATLAS_TIME_ZONE = "Europe/Paris";

const displayFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium", timeStyle: "short", timeZone: ATLAS_TIME_ZONE
});
const inputFormatter = new Intl.DateTimeFormat("en-GB", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ATLAS_TIME_ZONE
});

export function formatAtlasDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : displayFormatter.format(date);
}

export function toAtlasDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(inputFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Convert a Paris wall-clock input to an explicit instant before sending it to the API. */
export function atlasDateTimeInputToIso(value: string, original?: string | null) {
  if (!value) return "";
  // Editing another field must preserve seconds and either occurrence of an autumn overlap.
  if (original && toAtlasDateTimeInput(original) === value) return original;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("La date est invalide.");
  const wallClock = Date.parse(value + ":00Z");
  if (!Number.isFinite(wallClock) || new Date(wallClock).toISOString().slice(0, 16) !== value) {
    throw new Error("La date est invalide.");
  }
  // Obtain both offsets around a possible DST transition from the IANA timezone data.
  const offsets = new Set([-1, 0, 1].map((day) => {
    const probe = wallClock + day * 86400000;
    return Date.parse(toAtlasDateTimeInput(new Date(probe).toISOString()) + ":00Z") - probe;
  }));
  const matches = [...offsets]
    .map((offset) => new Date(wallClock - offset).toISOString())
    .filter((instant) => toAtlasDateTimeInput(instant) === value);
  if (matches.length === 0) {
    throw new Error("Cette heure n’existe pas à Paris lors du passage à l’heure d’été. Choisissez une autre heure.");
  }
  if (matches.length > 1) {
    throw new Error("Cette heure existe deux fois à Paris lors du passage à l’heure d’hiver. Choisissez une heure hors de cette période.");
  }
  return matches[0];
}
