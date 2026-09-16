# Database

Postgres, either embedded (PGlite, in `.data/pglite`) or a real server via
`DATABASE_URL`. The same migrations produce the same schema on both.

## Migrations

Numbered SQL in `db/migrations/`, applied in order and recorded in
`schema_migrations`. They are never edited once released — a change means a new
file.

| File | Contents |
| --- | --- |
| `0001_core.sql` | Holding, companies, users, sessions, roles, audit log, rate limits, tags, custom fields, saved views |
| `0002_crm.sql` | Clients, contacts, organizations, deals, activity |
| `0003_ops.sql` | Projects, tasks, dependencies, calendars, meetings, notes, documents, folders, imports |
| `0004_growth.sql` | Partnerships, investors, outreach, message templates |
| `0005_platform.sql` | Finance, team and contractors, ParFax platform, integrations |
| `0006_triggers.sql` | Timestamps, search vectors, the append-only audit log |
| `0007_rls.sql` | Row-level security policies and helper functions |
| `0008_app_role.sql` | The unprivileged `app_user` role those policies apply to |
| `0009_more_providers.sql` | Additional integration providers |

```bash
npm run db:migrate      # apply outstanding migrations
npm run db:seed         # core records, plus demo data unless disabled
npm run db:reset-demo   # clear demo rows and rebuild them
npm run db:nuke         # delete the embedded database entirely
```

The application also applies outstanding migrations on first use, so a
deployment cannot serve a schema older than its code.

## How the data is organised

**`holdings`** has one row. **`companies`** hang off it, and almost everything
else hangs off a company through `company_id`. That single column is what makes
a company workspace, a consolidated view and row-level security all work, and
what lets you add a company later without touching the schema.

A few things are deliberately holdings-level, with a null `company_id`:
investors, and holdings-wide role grants.

### Conventions

| | |
| --- | --- |
| `id` | `uuid`, `gen_random_uuid()` |
| `created_at`, `updated_at` | `timestamptz`, `updated_at` maintained by trigger |
| `deleted_at` | soft deletion on business records; queries filter it out |
| `is_demo` | true for demo rows; the only thing a demo reset deletes |
| `search_vector` | generated `tsvector` with a GIN index, where searched |
| Money | `numeric(14,2)`, with a currency on the company |

Nothing is hard-deleted except demo data and expired sessions. Everything else
is soft-deleted, so a mistake is recoverable and the audit trail still points
at something real.

## The main tables

**People and access** — `users`, `sessions`, `user_company_roles`,
`rate_limits`. A session stores only the SHA-256 of its token. A role grant
with a null `company_id` is holdings-wide.

**CRM** — `clients`, `contacts`, `organizations`, `deals`, plus the join tables
`client_contacts`, `client_team`, `contact_roles`, `organization_roles`.
Clients carry a status, a stage, a health score and a retainer.

**Work** — `projects`, `tasks`, `task_dependencies`, `comments`, `reminders`.
Tasks have an assignee, a due date, a priority, an estimate, and an optional
recurrence rule; completing a recurring task creates the next occurrence.

**Calendar and records** — `calendars`, `meetings`, `meeting_participants`,
`action_items`, `notes`, `documents`, `document_links`, `folders`. Documents
are versioned through `is_current` and a `supersedes_id` chain.

**Money** — `invoices`, `payments`, `expenses`, `subscriptions`,
`contractor_invoices`, `financial_adjustments`. An adjustment records a
correction with its reason and both values rather than editing the original.

**Team** — `members`, `departments`, `teams`, `member_assignments`,
`org_chart_changes`. A member is an employee or a contractor. There is nowhere
in this table for a social security number or a bank account, by design.

**Growth** — `partnerships`, `partnership_contacts`, `investors`,
`investor_contacts`, `outreach_activities`, `message_templates`. Outreach
records what was prepared and what happened; nothing is sent from here.

**ParFax** — `parfax_users`, `parfax_locations`, `parfax_scans`,
`parfax_support_issues`, `parfax_marketplace_events`, `parfax_metrics`,
`parfax_annotations`. Each metric carries a `kind`:

| Kind | Meaning | Who writes it |
| --- | --- | --- |
| `raw` | Straight from platform data | The system |
| `calculated` | Derived from raw values | The system |
| `manual` | A historical figure entered by hand | A person, with a source |
| `forecast` | An expectation | A person, with a source |
| `target` | A goal | A person, with a source |
| `demo` | Sample data | The demo seed |

The interface labels every figure with its kind, and the action that records
one refuses `raw` and `calculated`.

**Integrations** — `integration_connections`, `integration_runs`,
`external_record_map`. Credentials are stored encrypted in
`credentials_encrypted`, with a display-safe `credentials_hint` alongside.
`external_record_map` holds a content hash of each side so a two-sided change
is reported as a conflict instead of being overwritten.

**Knowledge** — `knowledge_chunks`, with the chunk text, its source, its
company and a generated `tsvector`.

**Audit** — `audit_log`. Append-only: triggers raise on UPDATE and DELETE.

## Row-level security

Every table with a `company_id` has policies built on helper functions in the
`app` schema:

```sql
app.current_user_id()      -- from the per-transaction setting
app.is_service()           -- true for seeding and background work
app.can_read_company(id)
app.can_write_company(id)
```

These apply because `asUser()` switches to the `app_user` role, which does not
own the tables. Connecting as the owner — which PGlite does by default — would
bypass policies even with `FORCE ROW LEVEL SECURITY`, so the role matters.

```ts
await asUser(userId, async (db) => {
  // Sees only what this person may see, whatever the query says.
  return db.query('select * from clients');
});
```

## Backups

With a real Postgres, use its backups: point-in-time recovery on a managed
service, or `pg_dump` on a schedule. The embedded database is a directory —
copy `.data/pglite` while nothing is running.

`DEPLOYMENT.md` has specifics.
