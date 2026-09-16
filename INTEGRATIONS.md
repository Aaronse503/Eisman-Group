# Integrations

## The rule

An integration is described as **Connected** only after a real call to that
provider has succeeded. Nothing else produces that label. A failed test records
the error and stays disconnected, with the provider's own message shown.

**Demo Mode** is a separate state. It produces clearly labelled sample data,
makes no network request, and is badged in gold everywhere the data appears.
It exists so you can see what an integration would look like before deciding
whether to connect it. It is never described as a connection.

## What is implemented

| Provider | What it reads | Writes back | Status |
| --- | --- | --- | --- |
| ClickUp | Spaces, lists, tasks, assignees, statuses, due dates | No | Implemented |
| Stripe | Customers, invoices, payments, subscriptions, products | Read-only except for labelled actions | Implemented |
| Gusto | Employees, contractors, payroll totals, departments | No | Implemented |
| Google Calendar | Calendars, events, attendees, conference links | Behind write-back | Implemented |
| ParFax | Platform users, locations, scans, subscriptions | Behind write-back | Implemented |
| Anthropic | — | — | Implemented |

## What is not

These appear on the Integrations page so you can see they exist and that they
are not connected. Each says what it would do and what happens today instead.

| Provider | Today | Planned |
| --- | --- | --- |
| Resend (email) | Drafts and templates; nothing is sent | Sending, with per-message approval |
| Slack | Notifications live in this system only | Channel notifications, saving a thread as a note |
| Notion | Export to CSV and use Settings → Import data | Direct page and database import |
| Metricool | Campaign figures come from records here | Social and campaign performance |
| Otter | Upload a transcript to the Knowledge Hub | Transcripts into meeting notes and action items |
| LinkedIn | Profile URLs entered by hand | Contact enrichment, within what LinkedIn's API allows |

Some of the other tools in use need nothing here: **Google Suite** is covered
by the Google Calendar connection (Drive and Gmail would be separate work),
**Microsoft** and **Adobe** have no data this system needs, and **IncFile** is
a filing service rather than a data source. Expense categories such as food and
drink, parking and fuel, or a supermarket run, belong in **Finances →
Expenses**, not here.

## Connecting one

1. **Integrations**, then **Connect** on the provider.
2. Enter the credentials, or set them in the environment (below). The dialog
   lists exactly which values it needs and what each is for.
3. **Test connection.** A real call is made. On success the card shows the
   account name the provider returned, and the scopes it granted.
4. **Sync** pulls records in. Every run is recorded — what was read, what was
   written, what conflicted, and any error.

Credentials entered in the interface are encrypted with AES-256-GCM before
storage. Only a hint — the first and last few characters — is ever shown again.
Environment variables take precedence, which is the better arrangement for a
server: the credential never enters the database at all.

## What each provider needs

### ClickUp

- **API token** — ClickUp → your avatar → *Settings* → *Apps* → *Generate*.
  A personal token acts as you; a workspace token is better if you have one.
- **Team id** — the number in your workspace URL,
  `app.clickup.com/<team id>/home`.

`CLICKUP_API_TOKEN`, `CLICKUP_TEAM_ID`.

### Stripe

- **Restricted key**, not a secret key. Stripe → *Developers* → *API keys* →
  *Create restricted key*. Give it **read** on Charges, Customers, Invoices,
  Subscriptions and Products, and nothing else.

`STRIPE_SECRET_KEY`.

Stripe is read-only apart from a small number of clearly labelled actions,
which require the `finance:sensitive_action` permission, ask for a reason, use
Stripe's own workflow rather than editing a local value, and write to the audit
log. Cancelling a subscription in this system cancels it in Stripe; it does not
change a display value and hope.

### Gusto

- **Access token** and **company id** from Gusto's developer portal. Production
  access requires their approval; their demo environment works for testing.

`GUSTO_ACCESS_TOKEN`, `GUSTO_COMPANY_ID`.

Gusto reads headcount, roles, departments and payroll totals. It does not read
social security numbers or bank details, and the schema has nowhere to put them
if it did.

### Google Calendar

- **OAuth client** from Google Cloud Console: create a project, enable the
  Google Calendar API, create an OAuth 2.0 Client ID for a web application, and
  add `https://your-domain/api/integrations/google_calendar/callback` as an
  authorised redirect URI.

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

OAuth only. No Google password is ever requested or stored. The scopes asked
for are `calendar.readonly` and `calendar.events`, and nothing more.

### ParFax

- **API base URL** and **API key** for whichever system is ParFax's real source
  of record.

`PARFAX_API_BASE`, `PARFAX_API_KEY`.

Read-only until write-back is explicitly enabled, which needs the
`integration:enable_writeback` permission, a typed reason, and is recorded as a
critical audit event. **Identifying the actual system of record is the open
question here** — the adapter is written against a conventional REST shape and
will need adjusting once that is known.

### Anthropic

- **API key** from the Anthropic Console.

`ANTHROPIC_API_KEY`, and `AI_PROVIDER=anthropic` to switch to it.

Without a key the Knowledge Hub uses a local extractive provider: it ranks and
quotes sentences from the retrieved records. It is less fluent and cannot
invent anything. With a key, answers are generated from the retrieved sources
only, still cite them, and still report when the sources are insufficient.

## Syncing

A sync reads from the provider and maps each record to a local one through
`external_record_map`, which stores a content hash of both sides.

- Changed on their side only → updated here.
- Changed here only → left alone.
- Changed on both → recorded as a **conflict** and shown on the card, for a
  person to resolve. Nothing is silently overwritten.

Some fields are always owned locally regardless of what a provider says — a
team member's department, capacity and client assignments, for instance, are
organisational decisions made in this system, not in Gusto.

Every run is kept: when it started and finished, what triggered it, how many
records were read and written, how many conflicted, and the error if it failed.

## Write-back

Off by default for every provider. Turning it on requires the
`integration:enable_writeback` permission — Holdings Owner only — and a typed
reason, and produces a critical audit entry showing who, when and why.

## If a connection fails

The card shows the provider's own error. The usual causes:

- **401 or 403** — the key is wrong, expired, or lacks a scope. The card lists
  the scopes that were granted, which is usually enough to see what is missing.
- **404** — a team, company or account id is wrong.
- **429** — rate limited; the adapter backs off, and the run is recorded as a
  failure rather than a partial success.
- **Timeout** — every provider call has one. A timeout is reported as a
  timeout, not as a connection.
