import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repinDiagnostic } from './repin-brevo-diagnostic.mjs';

const now = Date.parse('2026-09-26T12:00:00Z');
const target = 'https://project-atlas-qa-beta-1-123456789-neos-immo.vercel.app/api/internal/recruitment-email/inbound';
const env = {
  ATLAS_DIAGNOSTIC_REPIN: 'qa-url-only', ATLAS_DIAGNOSTIC_REPIN_UNTIL: '2026-09-26T12:30:00Z',
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon',
  VERCEL_GIT_COMMIT_REF: 'agent/security-hardening-2026-09-26',
  NEXT_PUBLIC_SUPABASE_URL: 'https://mahgxumwucxehsooijag.supabase.co',
  BREVO_API_KEY: 'fixture-not-a-real-key', BREVO_INBOUND_WEBHOOK_SECRET: 'fixture-secret-'.repeat(4),
  BREVO_RECRUITMENT_INBOUND_DOMAIN: 'reply.neos-immo.com', ATLAS_DIAGNOSTIC_REPIN_TARGET: target
};
const before = {
  id: 7, type: 'inbound', domain: 'reply.neos-immo.com', events: ['inboundEmailProcessed'],
  url: 'https://project-atlas-qa-beta-1-2kc3xe013-neos-immo.vercel.app/api/internal/recruitment-email/inbound',
  headers: [{ key: 'x-atlas-brevo-webhook-secret', value: env.BREVO_INBOUND_WEBHOOK_SECRET }],
  auth: { type: 'none' }, batched: true, description: 'Fixture', modifiedAt: '2026-09-25T00:00:00Z'
};
const summary = { data: { processed: 0, stopped: 0, duplicates: 0, unmatched: 0, reviewRequired: 0 } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function mock(responses) {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.ok(responses.length, 'Unexpected network request');
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  };
  return { calls, request };
}
for (const [key, value] of [
  ['ATLAS_DIAGNOSTIC_REPIN', ''], ['VERCEL_ENV', 'production'], ['VERCEL_PROJECT_ID', 'other'],
  ['VERCEL_GIT_COMMIT_REF', 'main'], ['NEXT_PUBLIC_SUPABASE_URL', 'https://example.invalid'],
  ['ATLAS_DIAGNOSTIC_REPIN_UNTIL', '2026-09-26T11:59:00Z'],
  ['ATLAS_DIAGNOSTIC_REPIN_UNTIL', '2026-09-26T14:00:00Z'],
  ['BREVO_INBOUND_WEBHOOK_SECRET', ''], ['BREVO_RECRUITMENT_INBOUND_DOMAIN', 'other.invalid'],
  ['ATLAS_DIAGNOSTIC_REPIN_TARGET', 'https://attacker.invalid/'],
  ['ATLAS_DIAGNOSTIC_REPIN_TARGET', target + '?secret=bad'],
  ['ATLAS_DIAGNOSTIC_REPIN_TARGET', target.replace('https:', 'http:')],
  ['ATLAS_DIAGNOSTIC_REPIN_TARGET', target.replace('qa-beta-1', 'web')]
]) test('rejects unsafe configuration: ' + key + '=' + value, async () => {
  const m = mock([]);
  const result = await repinDiagnostic({ ...env, [key]: value }, m.request, now);
  assert.notEqual(result.status, 'UPDATED_VERIFIED');
  assert.equal(m.calls.length, 0);
});
test('updates only URL after empty authenticated probe and verifies all settings', async () => {
  const m = mock([json({ webhooks: [before] }), json(summary), new Response(null, { status: 204 }), json({ webhooks: [{ ...before, url: target, modifiedAt: '2026-09-26T12:00:00Z' }] })]);
  assert.deepEqual(await repinDiagnostic(env, m.request, now), { status: 'UPDATED_VERIFIED', settingsPreserved: true });
  assert.equal(m.calls.length, 4);
  assert.deepEqual(JSON.parse(m.calls[1].options.body), { items: [] });
  assert.equal(m.calls[1].options.headers['api-key'], undefined);
  assert.deepEqual(JSON.parse(m.calls[2].options.body), { url: target });
  assert.equal(m.calls[2].url, 'https://api.brevo.com/v3/webhooks/7');
});
test('is idempotent once pinned', async () => {
  const m = mock([json({ webhooks: [{ ...before, url: target }] }), json(summary)]);
  assert.equal((await repinDiagnostic(env, m.request, now)).status, 'ALREADY_PINNED');
  assert.equal(m.calls.length, 2);
});
for (const hooks of [[], [before, before], [{ ...before, headers: [] }], [{ ...before, url: 'https://other.invalid' }]]) {
  test('refuses ambiguous or modified webhook', async () => {
    const m = mock([json({ webhooks: hooks })]);
    assert.notEqual((await repinDiagnostic(env, m.request, now)).status, 'UPDATED_VERIFIED');
    assert.equal(m.calls.length, 1);
  });
}
test('does not repin when target rejects the existing secret', async () => {
  const m = mock([json({ webhooks: [before] }), json({}, 401)]);
  assert.equal((await repinDiagnostic(env, m.request, now)).status, 'TARGET_NOT_READY');
  assert.equal(m.calls.length, 2);
});
test('requires verification on ambiguous PUT outcome, never retries', async () => {
  const m = mock([json({ webhooks: [before] }), json(summary), new Error('network detail with secret')]);
  const result = await repinDiagnostic(env, m.request, now);
  assert.deepEqual(result, { status: 'VERIFICATION_REQUIRED' });
  assert.equal(m.calls.length, 3);
});
test('detects changes to other webhook settings', async () => {
  const m = mock([json({ webhooks: [before] }), json(summary), new Response(null, { status: 204 }), json({ webhooks: [{ ...before, url: target, headers: [] }] })]);
  assert.equal((await repinDiagnostic(env, m.request, now)).status, 'VERIFICATION_REQUIRED');
});
