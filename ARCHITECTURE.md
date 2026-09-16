# Architecture

## The shape of it

Next.js 15 App Router. Server Components read from Postgres directly; Server
Actions write. There is no API layer between the two, because there is no
second consumer — one application, one database, one set of types end to end.

```
src/
  app/
    (app)/            every signed-in page; the layout here is the shell
    api/              the few things that must be HTTP: sign-in, health, files
    login/            the only page outside the shell
  components/
    shell/            sidebar, top bar, company switcher, command palette
    ui/               buttons, cards, tables, dialogs — the design system
    <feature>/        pieces belonging to one area
  lib/
    db/               the database client and the migration runner
    auth/             sessions, sign-in, the current actor
    rbac/             roles and permissions
    queries/          read queries, one module per area
    domain/           constants and row types, safe for the browser
    validation/       Zod schemas, separate from the actions that use them
    integrations/     the provider registry and one adapter per provider
    knowledge/        indexing, retrieval and the assistant
    ai/               the provider abstraction and the local extractive fallback
    seed/             the core seed and the demo data
  server/
    actions/          every write, one module per area
db/migrations/        numbered SQL, applied in order, never edited after release
tests/                unit, integration and end-to-end
scripts/              migrate, seed, reset, and development helpers
```

## Two rules that shaped the layout

**`'use server'` files may only export async functions.** So Zod schemas live
in `src/lib/validation/`, not beside the actions that use them. An action
imports its schema; nothing else changes.

**A Client Component must not drag Postgres into the browser bundle.** So
constants and row types live in `src/lib/domain/`, and `src/lib/queries/`
re-exports them. A client component imports the type from `domain`, a server
component imports the query from `queries`, and `pg` stays on the server.

Both are the kind of constraint that is invisible when respected and very loud
when not.

## The database

One client, two drivers:

- **PGlite** — Postgres 17 compiled to WebAssembly, running in-process with
  its data in `.data/pglite`. This is what you get with no configuration.
- **`pg`** — a normal connection pool, used when `DATABASE_URL` is set.

The same SQL and the same migrations run on both, so what works locally works
on a server. PGlite allows one process per data directory, so the client takes
a lock file beside the directory and fails with an explanation rather than
letting two processes corrupt it.

`src/lib/db/client.ts` exposes four ways in:

| | |
| --- | --- |
| `sql()` / `one()` | a query, as the service role |
| `tx()` | a transaction |
| `asUser(id, fn)` | switches to the unprivileged `app_user` role and sets the user id, so row-level security applies |
| `asService(fn)` | explicitly bypasses row-level security, for seeding and background work |

## Permissions, twice

Seven roles, thirty-eight permissions, granted per company. A grant with no
company is holdings-wide and covers companies added later.

The application checks first: `requireActor()`, `requirePermission()` and
`requireCompanyAccess()` guard every action and every page. This is the gate
that produces good error messages and hides navigation you cannot use.

The database checks second. Row-level security policies use
`app.current_user_id()` and friends, and they apply because `asUser()` switches
to a role that is not the owner of the tables. If a query ever forgets its
company filter, the database still returns nothing it should not.

Both are tested: `tests/unit/rbac.test.ts` for the rules,
`tests/integration/rls.test.ts` for what the database actually hands back.

## Writing

Every write goes through a Server Action, and every action:

1. validates its input with a Zod schema from `src/lib/validation/`,
2. resolves the actor and checks a permission for the company in question,
3. writes,
4. records an audit entry when the change is worth remembering,
5. revalidates the affected paths.

A test walks every exported action and fails if one skips step 2. Four
actions are exempt, each listed with its reason.

## The audit log

Append-only, enforced by triggers that raise on UPDATE and DELETE. Each entry
holds the actor, their address and user agent, the action, the record, the
reason, the value before and the value after. Sensitive keys are redacted on
the way in, so an integration credential cannot end up in the log by accident.

This is what makes "administrative changes preserve the original value" true
rather than aspirational: the application cannot rewrite history either.

## Integrations

A registry describes each provider — what it is, which credentials it needs,
which scopes it asks for, what it can sync, and whether it is implemented at
all. An adapter implements `test()` and `sync()`.

A connection is `disconnected` until `test()` makes a real call that succeeds.
Failure records the error and stays disconnected. Demo Mode is a third state
that produces clearly labelled sample data and makes no network request.

Synced records are mapped in `external_record_map`, which stores a content hash
of both sides. When both have changed since the last sync the row is flagged as
a conflict rather than overwritten, and the conflict count appears on the card.

## Knowledge and retrieval

Documents, notes, meetings and records are chunked into `knowledge_chunks`,
each with a generated `tsvector` and a GIN index, scoped to a company. A
question retrieves chunks the asker is allowed to read — the company filter is
applied in the query, not after it — and passes them to the AI provider.

Two providers:

- **Local** (the default): extractive. It ranks sentences from the retrieved
  text and quotes them. It cannot invent anything because it never generates
  anything.
- **Anthropic** (with a key): generates, but is given only the retrieved
  sources and must cite them, and returns an explicit "not enough here" when
  the sources do not answer the question.

## The interface

Tailwind CSS 4 with the design tokens defined in `src/app/globals.css`: deep
charcoal and dark emerald for navigation, cream for content, emerald and gold
for accents. Light and dark are both first-class — each token is redefined
under `.dark`.

Radix primitives for anything with keyboard and screen-reader behaviour worth
getting right. TanStack Table for data tables, Recharts for charts, dnd-kit for
the boards, cmdk for the command palette.

## Testing

| | |
| --- | --- |
| `tests/unit/` | Pure logic: permissions, crypto, CSV validation, dates and recurrence |
| `tests/integration/` | Against a real database: row-level security, the audit log, authentication, integrations, demo isolation, retrieval |
| `tests/e2e/` | Playwright, against a production build with its own database |

Unit and integration tests use `.data/test-pglite`; the end-to-end suite uses
`.data/e2e-pglite`. Neither touches your development data.
