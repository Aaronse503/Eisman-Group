# Deployment

Nothing is deployed and nothing is costing anything. This describes what
deploying would involve, so the decision is yours to make with the numbers in
front of you.

## What it needs

A Node 20+ host that can run a Next.js server, and a Postgres database. That
is all — no queue, no cache, no object store, no search service.

## Option A: Vercel and a managed Postgres

The least work. Roughly **$20–45 a month** for a small team.

1. **Database.** Create a Postgres on Supabase, Neon or Vercel Postgres. Copy
   the pooled connection string.
2. **Import the project** into Vercel from the repository. It detects Next.js;
   no build configuration is needed.
3. **Environment variables**, for Production:

   ```
   AUTH_SECRET=          # openssl rand -base64 48
   DATABASE_URL=         # from step 1, with sslmode=require
   ENCRYPTION_KEY=       # openssl rand -base64 32, exactly 32 bytes
   DEMO_MODE=false
   DISABLE_DEMO_DATA=true
   CRON_SECRET=          # openssl rand -base64 32; see "Reminders" below
   ```

   Add integration credentials only as you connect each one.
4. **Deploy.** Migrations run automatically on first use; you can also run
   `npm run db:migrate` locally against the same `DATABASE_URL` first if you
   prefer to see them apply.
5. **Create the owner account:**

   ```bash
   DATABASE_URL="…" npm run db:seed -- --no-demo
   ```

   Then sign in and change the password immediately.

Use a connection-pooled URL. Serverless functions open many short-lived
connections, and an unpooled Postgres will run out.

## Option B: your own server

More control, less monthly cost, more of your time.

```bash
git clone … && cd Eisman-Group
npm ci
npm run build
DATABASE_URL="…" npm run db:migrate
npm run start:production # behind nginx or Caddy with TLS
```

Run it under systemd or in Docker. Put a reverse proxy in front for TLS and
make sure it sets `X-Forwarded-Proto`, which is how the session cookie decides
whether to be `Secure`.

A single container with a Postgres alongside is enough for a team of this size.

## Reminders and notifications

Two things run on a schedule rather than on a request.

**Reminders.** A reminder is a row until something turns it into a
notification. `POST /api/v1/cron/reminders` does that for everything that has
come due. It authenticates with `CRON_SECRET` as a bearer token, and with no
secret configured it refuses to run at all rather than leaving an endpoint
open that writes notifications to other people.

On Vercel, add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/v1/cron/reminders", "schedule": "*/15 * * * *" }] }
```

Vercel's own cron sends the secret it is configured with; on any other host,
a systemd timer or a crontab line is enough:

```
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain/api/v1/cron/reminders > /dev/null
```

Running it more than once at the same moment is safe: a reminder is marked
sent only after its notification exists, and the second run finds nothing due.

**Push delivery.** `PUSH_PROVIDER` defaults to `expo`. Notifications are
always recorded in the database; pushing them to a phone additionally needs
the Expo project and the APNs/FCM credentials described in `MOBILE.md`. Set
`PUSH_PROVIDER=none` to record notifications without pushing them anywhere —
the mobile app then says so on its Settings screen instead of offering a
toggle that does nothing. Every delivery attempt is recorded in
`push_deliveries` with its outcome.

## The mobile application

The phone talks to the same deployment over HTTPS. Two things to set:

- `APP_URL` on the server, so links in notifications resolve.
- `EXPO_PUBLIC_API_URL` in the EAS build profile (`apps/mobile/eas.json`),
  pointing at the same domain. It is baked into the build, so changing the
  domain means a new build.

Builds go through EAS and are distributed internally. Nothing is submitted to
the App Store or Google Play. See `MOBILE.md`.

## Do not deploy the embedded database

PGlite is for local development and testing. It is a single process with its
data in a directory — no backups, no replication, no concurrent access. A
deployment needs a real Postgres.

## Backups

This is the part not to skip.

**Managed Postgres:** turn on daily backups and point-in-time recovery. On
Supabase and Neon this is a setting, not a project.

**Your own Postgres:**

```bash
pg_dump --format=custom "$DATABASE_URL" > eisman-$(date +%F).dump
```

Nightly, kept somewhere other than the database server, with a retention you
have actually decided on. Test a restore into a scratch database once — an
untested backup is a belief, not a backup.

**What is irreplaceable:** the audit log, because it cannot be reconstructed,
and uploaded documents. Everything else could in principle be re-synced from
its source system; those two could not.

## After deploying

- Sign in as the owner and change the password.
- **Settings → Members**: invite your team with the role each needs. Each
  invitation produces a one-time temporary password shown once — pass it on
  through something safe, not email.
- **Settings → Demo data**: confirm there is none, or clear it.
- **Integrations**: connect one provider at a time and test each.
- **Settings → Audit log**: confirm your own sign-in is there. If it is, the
  audit trail is working.

## Keeping an eye on it

There is a health endpoint at `/api/health` that checks the database and
returns the schema version. Point an uptime monitor at it.

Beyond that: Vercel's own logs, or your platform's, are enough at this size.
The application logs at `LOG_LEVEL`, and errors include enough context to find
the request. Add Sentry if and when the volume justifies it — it is not needed
on day one.

Worth a look weekly for the first month:

- Failed sign-ins in the audit log.
- Integration runs that failed or reported conflicts.
- Anything in the audit log marked critical.

## Cost, honestly

| | Roughly |
| --- | --- |
| Vercel Hobby | free, fine to start; Pro is $20/user/month if you outgrow it |
| Supabase or Neon | free tier to start; ~$25/month for a production instance |
| Anthropic API | pay per use; optional, and the local provider costs nothing |
| Your own server | $10–20/month for a VPS that would handle this comfortably |

Nothing will be spent without you deciding to spend it.

## Updating

```bash
git pull
npm ci
npm run verify          # typecheck, lint, tests
npm run build
npm run db:migrate      # only if there are new migrations
```

Migrations are additive and never edited after release, so a deployment can
always roll forward. Take a backup before a release that adds migrations
anyway.
