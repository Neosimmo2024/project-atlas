import "server-only";
import { SMS_PILOT_MESSAGE } from "@/features/recruitment-sms/pilot-preview";

export type SmsOutcome = { status: "accepted"; messageId: string } | { status: "rejected" | "unknown" | "cancelled" };
export type SmsPilotJournal = {
  begin: () => Promise<string>;
  finish: (id: string, outcome: SmsOutcome) => Promise<void>;
};
type Options = {
  enabled: boolean;
  recipient: string;
  apiKey?: string;
  authorize: () => Promise<void>;
  verifyAccount: () => Promise<boolean>;
  journal: SmsPilotJournal;
  transport?: typeof fetch;
};

/** One personal technical test. Durable claim before POST; never retries a POST. */
export async function sendBrevoSmsPilot(options: Options) {
  const { enabled, recipient, apiKey, authorize, verifyAccount, journal, transport = fetch } = options;
  if (!enabled) return { status: "disabled" } as const;
  if (!/^\+33[67][0-9]{8}$/.test(recipient) || !apiKey?.trim()) return { status: "unconfigured" } as const;
  try {
    await authorize();
    if (!await verifyAccount()) return { status: "account_unverified" } as const;
    await authorize();
  } catch { return { status: "forbidden" } as const; }
  let id: string;
  try {
    id = await journal.begin();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("invalid_claim");
  } catch { return { status: "locked_or_unavailable" } as const; }
  let outcome: SmsOutcome;
  // A revoked session consumes the claim but cannot cause an external write.
  try { await authorize(); } catch {
    outcome = { status: "cancelled" };
    try { await journal.finish(id, outcome); } catch { return { status: "unknown" } as const; }
    return outcome;
  }
  try {
    const response = await transport("https://api.brevo.com/v3/transactionalSMS/send", {
      method: "POST", headers: { "api-key": apiKey.trim(), accept: "application/json", "content-type": "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ sender: "NEOSIMMO", recipient: recipient.slice(1), content: SMS_PILOT_MESSAGE,
        type: "transactional", unicodeEnabled: false, tag: `atlas-sms-pilot-${id}` }),
    });
    if (response.status === 201) {
      const body: unknown = await response.json();
      const value = body && typeof body === "object" && !Array.isArray(body) && "messageId" in body ? body.messageId : undefined;
      // Numeric IDs outside JS's safe range cannot be used as delivery evidence.
      const messageId = typeof value === "string" && /^[1-9][0-9]{0,31}$/.test(value) ? value
        : typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : undefined;
      outcome = messageId ? { status: "accepted", messageId } : { status: "unknown" };
    } else {
      await response.body?.cancel();
      outcome = [400, 401, 402, 403, 404, 405, 422, 429].includes(response.status)
        ? { status: "rejected" } : { status: "unknown" };
    }
  } catch { outcome = { status: "unknown" }; }
  try { await journal.finish(id, outcome); } catch { return { status: "unknown" } as const; }
  // No provider response body, phone or API key is returned or logged.
  return outcome;
}
