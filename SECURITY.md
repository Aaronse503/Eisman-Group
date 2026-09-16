# Security

## Signing in

First-party authentication. No third-party identity provider, no password
anywhere in the source.

- Passwords are hashed with **scrypt**, salted per password, and compared in
  constant time. The stored form is `scrypt$<salt>$<hash>`.
- A sign-in attempt runs the verification even when the account does not exist,
  so a missing account and a wrong password take comparable time and return the
  same message.
- Sessions are opaque 32-byte tokens. Only their **SHA-256** is stored, so the
  database contains nothing that can be used to sign in.
- The session cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and marked
  `Secure` when the request arrived over HTTPS — including behind a proxy that
  terminated TLS.
- Sign-in is rate limited: eight attempts per account and twenty per address
  every fifteen minutes, counted in the database so the limit holds across
  instances.
- An account created by an administrator gets a one-time temporary password,
  shown once on screen. The system stays locked for that person until they set
  their own — not a banner they can dismiss, but the only screen they can
  reach.

Each person can see their own active sessions under **Settings → Sessions**,
with the device, address and last activity, and can revoke any of them.
Changing a password revokes every other session.

## Who can do what

Seven roles, granted per company. A grant with no company is holdings-wide and
applies to companies created later.

| Role | In short |
| --- | --- |
| Holdings Owner | Everything, everywhere. Only this role creates companies, enables write-back or manages demo data |
| Company Admin | Everything within their company, including members and integrations |
| Finance | Financial records, payroll totals, financial reports, the audit log |
| Account Manager | Clients, contacts, deals, tasks, meetings, documents; can read finance |
| Team Member | Day-to-day work: tasks, notes, meetings, non-sensitive records |
| Contractor | Only their own assigned work and the documents attached to it |
| Viewer | Read-only, non-sensitive records |

**Settings → Roles & permissions** shows the full matrix, generated from the
code rather than written by hand, so it cannot drift.

### Enforced in two places

The application checks first. Every page and every action resolves the actor
and checks a permission against a specific company before doing anything.

The database checks second. Row-level security policies apply because the
application switches to an unprivileged `app_user` role for user-scoped
queries. A query that forgot its company filter still returns nothing it
should not.

A test walks every exported Server Action and fails if one reaches the database
without a permission check. Four are exempt — sign-in, sign-out, and recording
what you yourself just viewed — each listed with its reason.

## Secrets

- **Nothing sensitive is in the repository.** `.env.local` is ignored;
  `.env.example` documents every variable without a value.
- Integration credentials are encrypted with **AES-256-GCM** before storage,
  under `ENCRYPTION_KEY`. Only a hint — first and last few characters — is ever
  displayed again.
- Credentials supplied through the environment are never written to the
  database at all, which is the better arrangement for a server.
- Values that look sensitive are redacted before anything is written to the
  audit log: anything matching password, secret, token, api key, ssn, social,
  routing, account number, iban or cvv.
- In production the application refuses to start without `AUTH_SECRET`,
  `DATABASE_URL` and `ENCRYPTION_KEY`, rather than quietly using a development
  default.

## The audit log

Append-only, enforced by database triggers that raise on UPDATE and DELETE. The
application cannot rewrite it either.

Each entry records who (user and email), from where (address and user agent),
when, what action, on which record, why (the reason given), and the values
before and after.

Written for: sign-ins and failed sign-ins, role changes, member invitations and
deactivations, integration connections and credential changes, enabling
write-back, financial adjustments, ParFax user administration and metric
entries, imports and rollbacks, data exports, and demo resets.

Browse it under **Settings → Audit log**, filtered by company, person, action
or date, with the before-and-after difference for each entry.

## Money

- Stripe is read-only apart from a small number of clearly labelled actions.
- Those actions need `finance:sensitive_action`, ask for a reason, and are
  recorded as critical audit events.
- They use the provider's own workflow. Cancelling a subscription cancels it at
  Stripe; it does not change a local display value.
- A correction is recorded as a **financial adjustment** — the original value,
  the new one, the reason and the person — not as an edit to the original
  record.

## Personal data

- **No social security numbers. No bank account or routing numbers.** There is
  nowhere in the schema to put them, and a test asserts that no such column
  exists.
- Gusto provides headcount, roles, departments and payroll totals. It is not
  asked for, and does not store, anything more.
- Compensation is visible only to Finance and Company Admins.
- Exporting ParFax user data requires a reason and is recorded.

## Google

OAuth only, with `calendar.readonly` and `calendar.events`. A Google password
is never requested, never stored, and there is no code path that would accept
one.

## Email

Nothing is sent. Investor and partnership outreach prepares drafts for a person
to send themselves. When a sending integration is added it will require
explicit approval per message; that is the design, not an afterthought.

## Answers from your records

The Knowledge Hub answers only from records the asker can read — the company
filter is part of the retrieval query, not applied to the results afterwards —
and every answer cites the records it used. When the sources do not contain an
answer it says so.

The default provider is extractive: it quotes sentences from your records and
cannot generate a claim. With an Anthropic key it generates, but only from the
retrieved sources, and still cites and still reports insufficiency.

## Demo data

Every demo row carries `is_demo`. A reset deletes strictly where that flag is
true, so records you created are never in scope. Demo records are badged in
gold wherever they appear. Setting `DISABLE_DEMO_DATA=true` blocks the seed,
the reset and Demo Mode entirely.

## Transport and headers

The application sets a Content Security Policy, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, a referrer policy, a permissions policy, and
HSTS in production. Every database query is parameterised; there is no string
interpolation of user input into SQL.

## Reporting something

If you find a problem, raise it with the Holdings Owner directly rather than in
a ticket, and include what you did and what you saw. The audit log will usually
have the rest.
