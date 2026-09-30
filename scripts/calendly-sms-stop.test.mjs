import test from 'node:test';
import assert from 'node:assert/strict';
import { binding, syncCalendlyStops } from './calendly-sms-stop.mjs';

function fixture({ wrongAccount = false, badUri = false, already = false, missing = false, cycle = false } = {}) {
  const writes = [];
  const calls = [];
  const page = collection => ({ collection, pagination: { next_page_token: null } });
  const transport = async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'error');
    if (options.method !== 'GET') { writes.push(JSON.parse(options.body)); return new Response(null, { status: 204 }); }
    let data;
    if (url.endsWith('/users/me')) data = { resource: { email: wrongAccount ? 'wrong@example.com' : binding.email, uri: 'https://api.calendly.com/users/user1' } };
    else if (url.endsWith('/account')) data = { organization_id: binding.organization };
    else if (url.endsWith('/contacts/lists/8')) data = { id: 8, name: binding.listName };
    else if (url.includes('/event_types?')) data = page([{ uri: 'https://api.calendly.com/event_types/type1', scheduling_url: binding.schedulingUrl }]);
    else if (url.includes('/scheduled_events?')) {
      data = page([{ uri: badUri ? 'https://evil.example/steal' : 'https://api.calendly.com/scheduled_events/event1', event_type: 'https://api.calendly.com/event_types/type1' }, { uri: 'https://api.calendly.com/scheduled_events/other', event_type: 'other' }]);
      if (cycle) data.pagination.next_page_token = 'loop';
    } else if (url.includes('/invitees?')) data = page([{ email: 'prospect@example.com' }, { email: 'prospect@example.com' }]);
    else if (url.includes('/contacts/prospect')) {
      if (missing) return new Response(null, { status: 404 });
      data = { id: 12, email: 'prospect@example.com', listIds: already ? [8] : [2] };
    } else throw Error('Unexpected endpoint');
    return Response.json(data);
  };
  return { transport, writes, calls };
}
const credentials = { token: 'test-token', brevoKey: 'test-key' };
test('dry-run is default, deduplicates and ignores unrelated event types', async () => {
  const f = fixture();
  const result = await syncCalendlyStops({ ...credentials, transport: f.transport });
  assert.equal(result.planned, 1);
  assert.equal(f.writes.length, 0);
  assert(!f.calls.some(url => url.includes('/other/invitees')));
});
test('apply only adds existing contact to stop list, repeat is a no-op', async () => {
  const f = fixture();
  assert.equal((await syncCalendlyStops({ ...credentials, transport: f.transport, apply: true })).added, 1);
  assert.deepEqual(f.writes, [{ listIds: [8] }]);
  const repeat = fixture({ already: true });
  assert.equal((await syncCalendlyStops({ ...credentials, transport: repeat.transport, apply: true })).alreadyStopped, 1);
  assert.equal(repeat.writes.length, 0);
});
test('wrong account stops before reading invitees or touching Brevo', async () => {
  const f = fixture({ wrongAccount: true });
  await assert.rejects(syncCalendlyStops({ ...credentials, transport: f.transport, apply: true }), /account mismatch/);
  assert.equal(f.calls.length, 1);
});
test('unmatched email never creates a contact', async () => {
  const f = fixture({ missing: true });
  assert.equal((await syncCalendlyStops({ ...credentials, transport: f.transport, apply: true })).unmatched, 1);
  assert.equal(f.writes.length, 0);
});
test('untrusted resource URL cannot leak the token', async () => {
  const f = fixture({ badUri: true });
  await assert.rejects(syncCalendlyStops({ ...credentials, transport: f.transport, apply: true }), /Invalid Calendly resource/);
  assert(!f.calls.some(url => url.includes('evil')));
  assert.equal(f.writes.length, 0);
});
test('pagination loops stop before any mutation', async () => {
  const f = fixture({ cycle: true });
  await assert.rejects(syncCalendlyStops({ ...credentials, transport: f.transport, apply: true }), /pagination/);
  assert.equal(f.writes.length, 0);
});
