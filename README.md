# Eisman Holdings Command Center

An internal operating system for Eisman Holdings. One place for clients,
work, money, people, partnerships, investors, documents and the ParFax
platform, with a consolidated holdings view and a workspace per company.

It ships with two companies — **Eisman Digital** and **ParFax** — and you can
add more from the interface without touching the code.

## Run it

```bash
npm install
npm run setup     # creates the database, migrates it, loads demo data
npm run dev       # http://localhost:3000
```

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

Next.js 15 (App Router) and React 19 in TypeScript, Postgres, Tailwind CSS 4
and Radix primitives. Server Components read; Server Actions write. The
database is either embedded PGlite or any Postgres — one set of migrations,
one set of SQL.

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

## Documentation

| File | What it covers |
| --- | --- |
| `SETUP.md` | Getting it running, from a laptop to a server |
| `ARCHITECTURE.md` | How the system is put together |
| `DATABASE.md` | The schema, the migrations and the data model |
| `INTEGRATIONS.md` | Every integration, what it needs, and what it does |
| `SECURITY.md` | Authentication, permissions, encryption and the audit trail |
| `DEPLOYMENT.md` | Hosting, backups and going live |
| `USER_GUIDE.md` | Using the system, written for the people who will |

## Commands

```bash
npm run dev            # development server
npm run build          # production build
npm run start          # serve the production build
npm run setup          # migrate and seed
npm run db:migrate     # migrate only
npm run db:seed        # seed only
npm run db:reset-demo  # clear and rebuild demo data
npm run db:nuke        # delete the embedded database entirely
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run test           # unit and integration tests
npm run test:e2e       # end-to-end tests
npm run verify         # typecheck, lint and test together
```

The embedded database allows one process at a time, so stop the dev server
before running a `db:*` script against it.
