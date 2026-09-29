type Options = {
  enabled?: boolean; apiKey?: string; accountTenantId: string;
  externalId: string; contactId: number; email: string;
  authorize: () => Promise<void>; transport?: typeof fetch;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** QA-only caller. Restriction-only: never creates, subscribes, sends or edits identity. */
export async function ensureBrevoPilotChannels(o: Options) {
  const fail = () => ({ status: "channels_unconfirmed" as const });
  if (o.enabled !== true || !o.apiKey?.trim() || !Number.isSafeInteger(o.contactId) || o.contactId <= 0
    || !/^atlas:[0-9a-f-]{36}:[0-9a-f-]{36}$/.test(o.externalId)
    || !o.externalId.startsWith(`atlas:${o.accountTenantId}:`) || !emailPattern.test(o.email)
    || !o.email.endsWith("@example.invalid")) return fail();
  const request = async (path: string, body?: object) => {
    await o.authorize();
    return (o.transport ?? fetch)(`https://api.brevo.com/v3/${path}`, {
      method: body ? "PUT" : "GET", headers: { "api-key": o.apiKey!.trim(), accept: "application/json", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
  };
  const json = async (path: string) => {
    const r = await request(path); if (r.status !== 200) throw new Error("unavailable");
    const v: unknown = await r.json(); if (!object(v)) throw new Error("unavailable"); return v;
  };
  const contactPath = `contacts/${encodeURIComponent(o.externalId)}?identifierType=ext_id`;
  const contact = async () => {
    const c = await json(contactPath);
    if (c.id !== o.contactId || c.email !== o.email || (c.ext_id !== undefined && c.ext_id !== o.externalId)
      || !object(c.attributes) || typeof c.emailBlacklisted !== "boolean") throw new Error("identity");
    // This fixture has no phone. Do not add one or claim a live SMS test succeeded.
    if (c.attributes.SMS !== undefined && c.attributes.SMS !== null && c.attributes.SMS !== "") throw new Error("phone_present");
    return c;
  };
  const senders = async () => {
    const v = await json("senders");
    if (!Array.isArray(v.senders) || !v.senders.length || v.senders.length > 100) throw new Error("senders");
    const values = v.senders.map(s => {
      if (!object(s) || typeof s.email !== "string" || !emailPattern.test(s.email)) throw new Error("sender");
      return s.email.toLowerCase();
    });
    return [...new Set(values)].sort();
  };
  const blocked = async (sender: string) => {
    // Provider-filtered sender scope includes global blocks (nullable senderEmail).
    for (let offset = 0; offset < 1000; offset += 100) {
      const v = await json(`smtp/blockedContacts?senders=${encodeURIComponent(sender)}&limit=100&offset=${offset}`);
      if (!Array.isArray(v.contacts) || typeof v.count !== "number" || !Number.isSafeInteger(v.count) || v.count < 0) throw new Error("blocklist");
      for (const c of v.contacts) {
        if (object(c) && c.email === o.email && (c.senderEmail === null || c.senderEmail === sender)) return true;
      }
      if (offset + v.contacts.length >= v.count) return false;
      if (v.contacts.length !== 100) throw new Error("incomplete");
    }
    throw new Error("limit");
  };
  try {
    let current = await contact();
    const before = await senders();
    const missing: string[] = [];
    for (const sender of before) if (!await blocked(sender)) missing.push(sender);
    if (!current.emailBlacklisted || missing.length) {
      current = await contact(); // Recheck identity immediately before a restriction.
      const body = { emailBlacklisted: true, ...(missing.length ? { smtpBlacklistSender: before } : {}) };
      const response = await request(contactPath, body);
      // No implicit retry after timeout, unknown response or rate limit.
      if (response.status !== 204) return fail();
    }
    const after = await contact();
    const latestSenders = await senders();
    if (!after.emailBlacklisted || JSON.stringify(latestSenders) !== JSON.stringify(before)) return fail();
    for (const sender of latestSenders) if (!await blocked(sender)) return fail();
    await o.authorize();
    return { status: "verified" as const, contactId: o.contactId, senderCount: latestSenders.length, sms: "not_configured" as const };
  } catch { return fail(); }
}
