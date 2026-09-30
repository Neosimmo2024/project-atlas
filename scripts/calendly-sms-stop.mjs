import { pathToFileURL } from 'node:url';

// NEOS pilot only. Never infer account/list identity from a supplied credential.
const CALENDLY = 'https://api.calendly.com';
const BREVO = 'https://api.brevo.com/v3';
export const binding = Object.freeze({
  email: 'renato.ponzio@neos-immo.com',
  schedulingUrl: 'https://calendly.com/renato-ponzio/30min',
  organization: '69aae9fea303e8f4220b4e98',
  listId: 8,
  listName: 'NEOS IMMO - Arret recrutement SMS',
});

function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid provider response');
  return value;
}
function apiPath(uri, kind) {
  if (typeof uri !== 'string') throw Error('Invalid Calendly resource');
  const match = uri.match(new RegExp(`^https://api\\.calendly\\.com/${kind}/([A-Za-z0-9_-]+)$`));
  if (!match) throw Error('Invalid Calendly resource');
  return `/${kind}/${match[1]}`;
}

/** Safe default: reads only. No SMS/email sending, creation, deletion, or unblocking.
 * Scans all bookings (including canceled bookings) so an already-booked prospect
 * never resumes recruitment merely because a meeting was canceled or rescheduled.
 * Exact email matching only; SMS-only contacts need a separately verified mapping.
 */
export async function syncCalendlyStops({ token, brevoKey, apply = false, transport = fetch }) {
  if (!token?.trim() || !brevoKey?.trim()) throw Error('Missing server credentials');
  let requestCount = 0;
  async function request(base, path, method = 'GET', payload, allowMissing = false) {
    if (++requestCount > 400) throw Error('Request budget exceeded');
    const headers = base === CALENDLY
      ? { authorization: `Bearer ${token}`, accept: 'application/json' }
      : { 'api-key': brevoKey, accept: 'application/json' };
    if (payload) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await transport(base + path, {
        method, headers, redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
    } catch { throw Error('Provider connection failed'); }
    if (allowMissing && response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw Error('Provider request rejected'); }
    if (response.status === 204) return {};
    try { return object(await response.json()); }
    catch { throw Error('Invalid provider response'); }
  }
  async function collection(path, query) {
    const results = [];
    const seen = new Set();
    let page = '';
    for (let n = 0; n < 50; n++) {
      const params = new URLSearchParams({ ...query, count: '100', ...(page ? { page_token: page } : {}) });
      const data = await request(CALENDLY, `${path}?${params}`);
      if (!Array.isArray(data.collection)) throw Error('Invalid provider collection');
      results.push(...data.collection.map(object));
      const next = object(data.pagination).next_page_token;
      if (next === null || next === undefined || next === '') return results;
      if (typeof next !== 'string' || seen.has(next)) throw Error('Invalid provider pagination');
      seen.add(next);
      page = next;
    }
    throw Error('Pagination budget exceeded');
  }

  const me = object((await request(CALENDLY, '/users/me')).resource);
  if (me.email?.toLowerCase() !== binding.email) throw Error('Calendly account mismatch');
  apiPath(me.uri, 'users');
  const account = await request(BREVO, '/account');
  if (account.organization_id !== binding.organization) throw Error('Brevo account mismatch');
  const list = await request(BREVO, `/contacts/lists/${binding.listId}`);
  if (list.id !== binding.listId || list.name !== binding.listName) throw Error('Brevo stop list mismatch');

  const types = await collection('/event_types', { user: me.uri });
  const targets = types.filter(type => type.scheduling_url === binding.schedulingUrl);
  if (targets.length !== 1) throw Error('Calendly recruitment event not uniquely identified');
  apiPath(targets[0].uri, 'event_types');
  const events = await collection('/scheduled_events', { user: me.uri });
  const emails = new Set();
  let bookings = 0;
  let missingEmail = 0;
  for (const event of events) {
    if (event.event_type !== targets[0].uri) continue;
    const path = apiPath(event.uri, 'scheduled_events');
    const invitees = await collection(`${path}/invitees`, {});
    for (const invitee of invitees) {
      bookings++;
      const email = typeof invitee.email === 'string' ? invitee.email.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { missingEmail++; continue; }
      emails.add(email);
    }
  }
  const summary = { mode: apply ? 'apply' : 'dry-run', bookings, missingEmail, unmatched: 0, alreadyStopped: 0, planned: 0, added: 0 };
  const ids = new Set();
  // Resolve and validate the entire plan before the first mutation.
  for (const email of emails) {
    const contact = await request(BREVO, `/contacts/${encodeURIComponent(email)}?identifierType=email_id`, 'GET', undefined, true);
    if (!contact) { summary.unmatched++; continue; }
    if (contact.email?.toLowerCase() !== email || !Number.isSafeInteger(contact.id) || contact.id < 1 || !Array.isArray(contact.listIds)) {
      throw Error('Invalid Brevo contact match');
    }
    if (contact.listIds.includes(binding.listId)) summary.alreadyStopped++;
    else ids.add(contact.id);
  }
  summary.planned = ids.size;
  if (apply) {
    // Idempotent list membership: reruns never enroll contacts into a sending list.
    for (const id of ids) {
      await request(BREVO, `/contacts/${id}?identifierType=contact_id`, 'PUT', { listIds: [binding.listId] });
      summary.added++;
    }
  }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await syncCalendlyStops({
      token: process.env.CALENDLY_PERSONAL_ACCESS_TOKEN,
      brevoKey: process.env.BREVO_API_KEY,
      apply: process.env.AVENOR_CALENDLY_STOP_APPLY === 'true',
    });
    console.log(JSON.stringify(result));
  } catch {
    // Never log provider bodies, request URLs, invitees, credentials or stack traces.
    console.error('Calendly stop synchronization failed; investigate before enabling SMS.');
    process.exitCode = 1;
  }
}
