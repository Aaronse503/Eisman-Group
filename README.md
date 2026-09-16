# Eisman Holdings Command Center

An internal operating system for Eisman Holdings. One place for clients,
work, money, people, partnerships, investors, documents and the ParFax
platform, with a consolidated holdings view and a workspace per company.

It ships with two companies — **Eisman Digital** and **ParFax** — and you can
add more from the interface without touching the code. There is a web
application and an iOS/Android app; both talk to the same server, the same
database and the same permissions.

## Run it

```bash
npm install
npm start
```

That is the whole thing. `npm start` builds the database if it is not there,
loads demo data, opens the web application on http://localhost:3000, works out
this machine's address on the network, and starts the phone app already
pointed at it — so there is no address to look up and no second window.

Scan the QR code it prints with your phone's camera (iPhone) or Expo Go
(Android). Your phone and your computer have to be on the same Wi-Fi.
Ctrl+C stops everything.

`npm run start:web` skips the phone app. `MOBILE.md` covers the mobile
application — what is on it, what stays on the desktop, and how to make a
build.

There is nothing to provision. With no configuration the system runs on an
embedded Postgres stored in `.data/pglite`, so `npm run setup` works on a
laptop with no database installed. Point `DATABASE_URL` at a real Postgres
when you are ready and the same migrations run against it.

### Signing in

| Account | Password | Role |
| --- | --- | --- |
| `aaron@eismandigital.com` | `ChangeMe123!` | Holdings Owner |
| `dana.ops@demo.eisman.test` | `demo1234!` | Company Admin, Eisman Digital |
| `marcus.finance@demo.eisman.test` | `demo1234!` | Finance |
| `priya.am@demo.eisman.test` | `demo1234!` | Account Manager |
| `jordan.parfax@demo.eisman.test` | `demo1234!` | Company Admin, ParFax |
| `noa.strategy@demo.eisman.test` | `demo1234!` | Team Member |
| `sam.design@demo.eisman.test` | `demo1234!` | Contractor |
| `val.viewer@demo.eisman.test` | `demo1234!` | Viewer |

The owner account is on a temporary password and the system stays locked until
it is changed. Sign in as the others to see exactly what each role can reach —
the differences are real, not cosmetic.

## What is in it

| Area | What it does |
| --- | --- |
| **Home** | Consolidated figures across every company you can see, each linking to the records behind it |
| **Companies** | Add and configure companies; each gets its own workspace |
| **CRM** | Clients, contacts, organizations and deals, as a table or a board |
| **Tasks** | Tasks and projects, list or Kanban, with dependencies and recurrence |
| **Calendar** | Meetings, agendas, notes and action items |
| **Finances** | Invoices, payments, expenses, subscriptions, profitability and cash flow |
| **Team** | Employees and contractors, assignments, capacity and contractor invoices |
| **Partnerships** | Partnership pipeline, contacts and agreements |
| **Investors** | Investor pipeline, outreach history and prepared drafts |
| **Knowledge Hub** | Documents and notes, full-text search, and answers that cite their sources |
| **Reports** | Twelve reports across finance, delivery, growth and the platform |
| **ParFax Admin** | Platform users, locations, scans, support issues and metrics |
| **Integrations** | ClickUp, Stripe, Gusto, Google Calendar, ParFax and Anthropic |
| **Settings** | Your profile, members and roles, sessions, imports, the audit log and demo data |

## How it is built

A monorepo. `apps/web` is Next.js 15 (App Router) and React 19 in TypeScript,
with Postgres, Tailwind CSS 4 and Radix primitives; Server Components read and
Server Actions write. `apps/mobile` is Expo and React Native. `packages/shared`
holds the types, validation schemas, permission rules and design tokens both
use, and `packages/api-client` the typed client the phone talks through.

The database is either embedded PGlite or any Postgres — one set of
migrations, one set of SQL.

`ARCHITECTURE.md` explains the structure and why it is shaped this way.

## Things it will not do

These are deliberate, and the tests enforce them:

- **No integration claims to be connected until it is.** A card reads
  *Connected* only after a real call to that provider has succeeded. Demo Mode
  is a separate, gold-badged state that makes no network request at all.
- **No number changes without a record of who changed it and why.** The audit
  log refuses UPDATE and DELETE at the database level, and keeps the value
  before, the value after, the reason and the operator.
- **No hand-written raw metrics.** A person can record a target, a forecast or
  a manual historical figure, each labelled as such. Values derived from
  production data cannot be typed in.
- **No invented answers.** Without an Anthropic key the Knowledge Hub quotes
  its sources verbatim; with one, every answer still cites the records it used,
  and it says when the sources do not contain the answer.
- **No demo data mixed with real data.** Every demo row is flagged, badged in
  the interface, and can be cleared without touching anything you created.
- **No sensitive payroll data.** No social security numbers, no bank details.
  The schema has nowhere to put them.
- **No outbound email.** Investor outreach prepares drafts; nothing is sent.
- **No notification claimed as delivered that was not.** A notification is
  recorded in the database first; pushing it to a phone is a separate,
  best-effort step, and every attempt is recorded with its outcome.
- **No second database for the phone.** The mobile app reads and writes the
  same rows under the same row-level security. Offline changes are queued on
  the device with an id the server records, so a retry applies once.

## Documentation

| File | What it covers |
| --- | --- |
| `SETUP.md` | Getting it running, from a laptop to a server |
| `ARCHITECTURE.md` | How the system is put together |
| `DATABASE.md` | The schema, the migrations and the data model |
| `INTEGRATIONS.md` | Every integration, what it needs, and what it does |
| `SECURITY.md` | Authentication, permissions, encryption and the audit trail |
| `DEPLOYMENT.md` | Hosting, backups and going live |
| `MOBILE.md` | The iOS and Android app, and how to build it |
| `USER_GUIDE.md` | Using the system, written for the people who will |

## Commands

```bash
npm start              # everything: database, web app and phone app
npm run start:web      # the same, without the phone app
npm run dev            # the web app alone, assuming a database already exists
npm run mobile         # the phone app alone
npm run build          # production build
npm run start:production  # serve the production build
npm run setup          # migrate and seed
npm run db:migrate     # migrate only
npm run db:seed        # seed only
npm run db:reset-demo  # clear and rebuild demo data
npm run db:nuke        # delete the embedded database entirely
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run test           # unit and integration tests, every workspace
npm run test:e2e       # end-to-end tests
npm run verify         # typecheck, lint and test together
```

The embedded database allows one process at a time, so stop the dev server
before running a `db:*` script against it. For the same reason, give the
end-to-end suite a scratch Postgres for a full run:

```bash
E2E_DATABASE_URL="postgresql://…/eisman_e2e" npm run test:e2e
```
