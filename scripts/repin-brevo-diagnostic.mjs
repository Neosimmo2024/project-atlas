import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

const original = 'https://project-atlas-qa-beta-1-2kc3xe013-neos-immo.vercel.app/api/internal/recruitment-email/inbound';
const endpoint = 'https://api.brevo.com/v3/webhooks?type=inbound';
const secretHeader = 'x-atlas-brevo-webhook-secret';
const emptySummary = { processed: 0, stopped: 0, duplicates: 0, unmatched: 0, reviewRequired: 0 };

// Explicit opt-in maintenance only, invoked from prebuild but inactive by default.
// Never sends mail, changes credentials, enables cron, or accepts SMTP headers as proof.
export async function repinDiagnostic(env, request, now = Date.now()) {
  if (env.ATLAS_DIAGNOSTIC_REPIN !== 'qa-url-only') return { status: 'SKIPPED' };
  const until = Date.parse(env.ATLAS_DIAGNOSTIC_REPIN_UNTIL ?? '');
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview'
    || env.VERCEL_PROJECT_ID !== 'prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon'
    || env.VERCEL_GIT_COMMIT_REF !== 'agent/security-hardening-2026-09-26'
    || env.NEXT_PUBLIC_SUPABASE_URL !== 'https://mahgxumwucxehsooijag.supabase.co'
    || !Number.isFinite(until) || until <= now || until - now > 3600000) {
    return { status: 'SCOPE_REJECTED' };
  }
  const key = env.BREVO_API_KEY?.trim();
  const secret = env.BREVO_INBOUND_WEBHOOK_SECRET?.trim();
  if (!key || !secret || secret.length < 32
    || env.BREVO_RECRUITMENT_INBOUND_DOMAIN !== 'reply.neos-immo.com') {
    return { status: 'MISSING_CONFIGURATION' };
  }
  let target;
  try {
    target = new URL(env.ATLAS_DIAGNOSTIC_REPIN_TARGET);
    if (target.protocol !== 'https:' || target.username || target.password || target.port
      || target.search || target.hash
      || !/^project-atlas-qa-beta-1-[a-z0-9]{9}-neos-immo\.vercel\.app$/.test(target.hostname)
      || target.pathname !== '/api/internal/recruitment-email/inbound'
      || target.href === original) return { status: 'TARGET_REJECTED' };
  } catch { return { status: 'TARGET_REJECTED' }; }

  let attempted = false;
  const callBrevo = (url, method = 'GET', body) => request(url, {
    method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'api-key': key, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  try {
    const list = await callBrevo(endpoint);
    if (list.status !== 200) { await list.body?.cancel(); return { status: 'READ_REJECTED' }; }
    const data = await list.json();
    if (!Array.isArray(data?.webhooks)) return { status: 'INVALID_RESPONSE' };
    const matches = data.webhooks.filter(h => h?.type === 'inbound' && h.domain === 'reply.neos-immo.com');
    if (matches.length !== 1) return { status: 'AMBIGUOUS_MATCH' };
    const before = matches[0];
    if (!Number.isSafeInteger(before.id) || before.id < 1
      || ![original, target.href].includes(before.url)
      || !Array.isArray(before.events) || !before.events.includes('inboundEmailProcessed')
      || !Array.isArray(before.headers)
      || !before.headers.some(h => h?.key?.toLowerCase() === secretHeader && h.value === secret)) {
      return { status: 'PRECONDITION_REJECTED' };
    }
    // The target must be a READY deployment independently verified by Vercel.
    // Empty payload exercises auth without generating an event or a follow-up task.
    const probe = await request(target.href, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', [secretHeader]: secret },
      body: JSON.stringify({ items: [] })
    });
    if (probe.status !== 200) { await probe.body?.cancel(); return { status: 'TARGET_NOT_READY' }; }
    if (!isDeepStrictEqual((await probe.json())?.data, emptySummary)) return { status: 'TARGET_NOT_READY' };
    if (before.url === target.href) return { status: 'ALREADY_PINNED', settingsPreserved: true };
    attempted = true;
    const update = await callBrevo('https://api.brevo.com/v3/webhooks/' + before.id, 'PUT', { url: target.href });
    await update.body?.cancel();
    if (update.status !== 204) return { status: 'VERIFICATION_REQUIRED' };
    const verify = await callBrevo(endpoint);
    if (verify.status !== 200) { await verify.body?.cancel(); return { status: 'VERIFICATION_REQUIRED' }; }
    const after = (await verify.json())?.webhooks?.find(h => h.id === before.id);
    // Brevo updates modifiedAt itself; compare all other returned settings.
    const { url: _previousUrl, modifiedAt: _previousDate, ...previousSettings } = before;
    const { url: nextUrl, modifiedAt: _nextDate, ...nextSettings } = after ?? {};
    if (nextUrl !== target.href || !isDeepStrictEqual(previousSettings, nextSettings)) {
      return { status: 'VERIFICATION_REQUIRED' };
    }
    return { status: 'UPDATED_VERIFIED', settingsPreserved: true };
  } catch {
    return { status: attempted ? 'VERIFICATION_REQUIRED' : 'READ_OR_PROBE_FAILED' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await repinDiagnostic(process.env, fetch);
  console.log('BREVO_DIAGNOSTIC_REPIN ' + JSON.stringify(result));
  if (!['SKIPPED', 'ALREADY_PINNED', 'UPDATED_VERIFIED'].includes(result.status)) process.exitCode = 1;
}
