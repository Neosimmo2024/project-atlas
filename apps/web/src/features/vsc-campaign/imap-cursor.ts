export type VscImapCursor = { uidValidity: string | null; lastUid: number; version: number };
export type VscImapBatch = {
  uidValidity: string; lastUid: number; hasMore: boolean; scanned: number;
  envelopes: import("./imap-envelope").VscInboundEnvelope[];
};

/** UID ranges are bounded and never use '*', which can replay an old last message. */
export function planVscImapBatch(cursor: VscImapCursor, uidValidity: string, uidNext: number, size = 200) {
  if (!/^[1-9]\d*$/.test(uidValidity) || !Number.isSafeInteger(uidNext) || uidNext < 1 || uidNext > 4294967296 ||
      !Number.isSafeInteger(cursor.lastUid) || cursor.lastUid < 0 || cursor.lastUid > 4294967295 ||
      !Number.isSafeInteger(size) || size < 1 || size > 200) throw new Error("État IMAP invalide");
  const previous = cursor.uidValidity === uidValidity ? cursor.lastUid : 0;
  const high = uidNext - 1;
  if (previous > high) throw new Error("Régression UID IMAP sans changement UIDVALIDITY");
  const lastUid = Math.min(high, previous + size);
  return { range: lastUid > previous ? `${previous + 1}:${lastUid}` : null, lastUid, hasMore: lastUid < high };
}
