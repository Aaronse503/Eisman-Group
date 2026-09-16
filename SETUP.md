# Setup

## On a laptop, with nothing installed

```bash
npm install
npm start
```

Open http://localhost:3000 and sign in as `aaron@eismandigital.com` with
`ChangeMe123!`. You will be asked to choose a real password before anything
else opens.

`npm start` does every step in order and says which one it is on: installs
anything missing, creates an embedded Postgres 17 under `.data/pglite`, runs
every migration, loads demo data, starts the web application, and starts the
phone app pointed at this machine's address on the network. No database
server, no credentials, no accounts anywhere. Requires Node 20 or newer.

`npm run start:web` does the same without the phone app. The individual steps
are still there — `npm run setup`, `npm run dev`, `npm run mobile` — for when
you want to run one of them on its own.

### The one rule about the embedded database

It allows **one process at a time**. Running a `db:*` script while the
development server is up will fail with a clear message rather than corrupt
anything, but stop the server first:

```bash
# stop `npm run dev`, then:
npm run db:reset-demo
```

If the database ever does end up in a bad state, rebuild it — nothing there is
irreplaceable:

```bash
npm run db:nuke && npm run setup
```

## On a phone

`npm start` already started it: scan the QR code it printed with your phone's
camera (iPhone) or with Expo Go (Android). Both devices have to be on the same
Wi-Fi.

`localhost` on a phone means the phone, so the app has to be told this
machine's address on the network. `npm start` works that out and passes it in.
To do it by hand, or to point at something else:

```bash
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000 npm run mobile
```

`MOBILE.md` covers what works in Expo Go, development builds, push
notifications and what stays on the desktop.

## On a real Postgres

Set `DATABASE_URL` and the same migrations run against it:

```bash
DATABASE_URL="postgresql://user:password@host:5432/eisman?sslmode=require" npm run db:migrate
```

Postgres 14 or newer. The schema uses `gen_random_uuid()` from `pgcrypto`,
which the first migration enables, and generated `tsvector` columns for search.

### Without demo data

```bash
DISABLE_DEMO_DATA=true npm run db:migrate
npm run db:seed -- --no-demo
```

That creates the holding company, the two companies and the owner account, and
nothing else. See **Going live** below for setting the owner's password.

## Configuration

Copy `.env.example` to `.env.local` and fill in only what you need. Nothing is
required to run locally. For a deployment, three things are:

| Variable | Why |
| --- | --- |
| `AUTH_SECRET` | Signs sessions. `openssl rand -base64 48` |
| `DATABASE_URL` | Your Postgres |
| `ENCRYPTION_KEY` | Encrypts stored integration credentials. `openssl rand -base64 32`, exactly 32 bytes |

The application refuses to start in production without them rather than
falling back to a development default.

Integration credentials are all optional. Without them the matching integration
shows as Disconnected, which is accurate. `INTEGRATIONS.md` lists what each one
needs and how to create it.

**Never paste a secret into a chat, a ticket or a commit.** `.env.local` is
ignored by git and should stay that way.

## Going live

1. Create the database and run the migrations.
2. Seed without demo data, or clear the demo data afterwards from
   **Settings → Demo data**.
3. Set `DEMO_MODE=false` and `DISABLE_DEMO_DATA=true`.
4. Set `AUTH_SECRET`, `DATABASE_URL` and `ENCRYPTION_KEY`.
5. Sign in as the owner, change the password, then invite your team from
   **Settings → Members**. Each invitation produces a one-time temporary
   password shown once on screen — no email is sent, so pass it on yourself
   through something safe.
6. Connect integrations one at a time, from **Integrations**.

`DEPLOYMENT.md` covers hosting, backups and monitoring.

## Checking your work

```bash
npm run verify     # typecheck, lint, unit and integration tests, every workspace
npm run test:e2e   # end-to-end, against a throwaway database of its own
```

The end-to-end suite builds the application and serves it on port 3100 with a
database of its own. It never touches your data.

For a full run, give it a scratch Postgres:

```bash
E2E_DATABASE_URL="postgresql://…/eisman_e2e" npm run test:e2e
```

Without one it uses the embedded database, which is fine for a quick check but
not for a long run: PGlite allows one process per data directory, a Next server
can serve requests from more than one, and a heavy run can damage it. When that
happens the tests fail in ways that look like application faults and are not.

## Troubleshooting

**"The embedded database is already open in process N."** Something else has
it — usually a development server. Stop that process and try again.

**"Could not open the embedded database."** The directory is damaged, which
means two processes reached it. `npm run db:nuke && npm run setup`.

**Port 3000 is in use.** `npm run dev -- -p 3001`.

**Sign-in says too many attempts.** The limiter allows eight attempts per
account and twenty per address every fifteen minutes. Wait, or raise
`LOGIN_ATTEMPTS_PER_EMAIL` locally.

**No accounts exist.** The sign-in screen says so and tells you to run
`npm run db:seed`.
