/**
 * Fires due reminders on a schedule.
 *
 * Netlify runs this; it does no work itself beyond calling the application's
 * own endpoint, so the logic stays in one place and is the same wherever this
 * is deployed. The endpoint authenticates with CRON_SECRET and refuses to run
 * without one, so a missing variable is a refusal rather than an open door.
 *
 * This file does nothing outside Netlify. On any other host, call the same
 * endpoint from cron — see DEPLOYMENT.md.
 */
export default async function handler() {
  const base = process.env.URL ?? process.env.APP_URL;
  const secret = process.env.CRON_SECRET;

  if (!base) return new Response('No site URL to call.', { status: 500 });
  if (!secret) {
    // Say it plainly in the function log rather than failing silently every
    // fifteen minutes for a week.
    return new Response('CRON_SECRET is not set, so reminders are not being sent.', {
      status: 503,
    });
  }

  const response = await fetch(`${base}/api/v1/cron/reminders`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Reminder run failed (${response.status}): ${body}`);
    return new Response(body, { status: response.status });
  }
  console.log(`Reminder run: ${body}`);
  return new Response(body, { status: 200 });
}

export const config = { schedule: '*/15 * * * *' };
