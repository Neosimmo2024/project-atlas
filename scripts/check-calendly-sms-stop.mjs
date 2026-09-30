import { syncCalendlyStops } from './calendly-sms-stop.mjs';

// Read-only deployment verification, restricted to the authorized NEOS QA branch.
const env = process.env;
if (env.VERCEL === '1' && env.VERCEL_ENV === 'preview'
    && env.VERCEL_PROJECT_ID === 'prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon'
    && env.VERCEL_GIT_COMMIT_REF === 'agent/calendly-free-sms-stop-2026-09-30') {
  let stage = 'credentials';
  let status = 0;
  try {
    const result = await syncCalendlyStops({
      token: env.CALENDLY_PERSONAL_ACCESS_TOKEN,
      brevoKey: env.BREVO_API_KEY,
      apply: false,
      transport: async (url, options) => {
        if (options.method !== 'GET') throw Error('Read-only verification');
        const path = new URL(url).pathname;
        stage = path === '/users/me' ? 'calendly-account'
          : path === '/v3/account' ? 'brevo-account'
          : path === '/v3/contacts/lists/8' ? 'brevo-stop-list'
          : path === '/event_types' ? 'calendly-event-types'
          : path === '/scheduled_events' ? 'calendly-events'
          : path.endsWith('/invitees') ? 'calendly-invitees' : 'brevo-contact-match';
        status = 0;
        const response = await fetch(url, options);
        status = response.status;
        return response;
      },
    });
    console.log('CALENDLY_STOP_CHECK ' + JSON.stringify({ status: 'PASSED', ...result }));
  } catch {
    // Only fixed stage labels and numeric HTTP status; no provider data or secrets.
    console.error('CALENDLY_STOP_CHECK ' + JSON.stringify({ status: 'FAILED', stage, httpStatus: status }));
    process.exitCode = 1;
  }
}
