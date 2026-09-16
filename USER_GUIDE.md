# Using the Command Center

## Finding your way around

The left navigation is grouped: **Overview** (Home, Companies), **Operate**
(CRM, Tasks, Calendar, Finances, Team), **Grow** (Partnerships, Investors,
Knowledge Hub, Reports) and **Administer** (ParFax Admin, Integrations,
Settings). It collapses to icons with the button at the bottom, and to a menu
on a phone.

Along the top:

- **The company switcher.** *Eisman Holdings* shows everything consolidated;
  picking a company narrows every page to it. The choice follows you around.
- **Search.** Finds clients, contacts, tasks, documents, meetings, partnerships
  and investors, across whatever you can see.
- **Create** (`+`). New client, contact, task, meeting, investor, partnership,
  document or invoice, from wherever you are.
- **Notifications.** Overdue work, follow-ups due, things that changed.
- **Your avatar.** Profile, roles, sessions, theme and sign out.

**⌘K** (or Ctrl+K) opens the command palette: search, jump to any page, create
anything, switch company. It is the fastest way to work once it is in your
fingers.

## Home

Four headline numbers, then the rest in a quieter strip beneath — everything
links to the records behind it. Nothing here is a figure you cannot click into
and check.

The range selector (last 30 days, this month, this quarter…) changes the
period, and each figure shows how it compares with the period before. Under
**Eisman Holdings** you also get a per-company breakdown, and the ParFax
platform numbers if you have access.

Every panel says where its numbers come from. If something says *Demo*, it is
sample data.

## CRM

**Clients** are accounts you deliver work for, each with a status, a stage, a
health score, a retainer, an owner and a renewal date. Switch between the table
and a board grouped by stage; drag a card to move it.

A client's page collects everything about them: contacts, team, tasks,
meetings, documents, invoices, notes and a full history of what changed.

**Health** is a score out of 100 that you set. Below 60 an account shows as at
risk on the dashboard and in *Accounts needing attention*. It is a judgement,
not a calculation, which is why it is yours to set.

**Contacts** are people; **Organizations** are companies that are not clients —
partners, vendors, referral sources. A contact can be linked to several.

**Deals** track pipeline: value, probability, expected close.

Every list can be filtered, sorted, searched and exported to CSV. Filters live
in the address bar, so a filtered list can be bookmarked or sent to a
colleague — saving one as a named view is not built yet.

## Tasks

List or board. The views down the side — **My tasks**, **Today**, **This
week**, **Overdue**, **Delegated**, **Waiting on**, **Recurring**,
**Personal** — are filters over the same tasks, not separate lists.

A task can belong to a client and a project, have an assignee, a due date, a
priority, an estimate, a checklist and attachments. Comments with `@mentions`
notify the person.

**Dependencies:** mark a task as blocked by another and it cannot be completed
until the blocker is. **Recurrence:** daily, weekly, monthly, yearly or every
weekday; completing one creates the next.

## Calendar

Month, week and day. Meetings carry an agenda, participants, notes and action
items; an action item becomes a real task, assigned and dated.

Connecting Google Calendar brings external events in alongside. Without it,
meetings created here live here.

## Finances

An operating view, not an accounting system. Export for your accountant rather
than filing from it.

- **Invoices** — issued, sent, paid, overdue. Create, record a payment, export.
- **Payments** — money in, from Stripe or recorded by hand.
- **Expenses** — categorised, by company, optionally against a client.
- **Subscriptions** — recurring revenue, from Stripe or entered here.
- **Profitability** — revenue against cost per client, showing which accounts
  actually make money.
- **Cash flow** — in, out and net over time.
- **Adjustments** — corrections, each with a reason and both values kept.

A **revenue concentration** warning appears when a single client is a large
share of income, with the number.

Correcting a figure never edits the original. It records an adjustment: the
old value, the new one, the reason and who made it. Both remain visible.

## Team

Employees and contractors, with role, department, manager, capacity and skills.
The org chart is built from the reporting lines.

**Assignments** connect people to clients, with an allocation, so you can see
who is over capacity before they tell you.

**Contractor invoices** move through submitted, approved and paid, and appear
on the dashboard as upcoming payments once approved.

Compensation is visible only to Finance and Company Admins. There are no social
security numbers or bank details in this system, and nowhere to put them.

## Partnerships and Investors

**Partnerships** track the pipeline from first contact to launched, with
contacts, terms, agreement documents and a value.

**Investors** track a raise: firm, type, cheque size, stage, probability,
owner, next follow-up. The pipeline shows total value and a probability-weighted
figure, marked as weighted wherever it appears.

**Outreach** records every contact — when, how, what was said, what came back.

**Drafts:** the system prepares outreach from templates, personalised from the
record. **Nothing is sent.** You copy the draft and send it yourself from your
own email. If a sending integration is added later it will require explicit
approval per message.

## Knowledge Hub

Upload documents — PDFs, Word files, spreadsheets, text — and attach them to a
client, partnership, investor or meeting. Text is extracted and indexed, and a
summary, key points and action items are pulled out.

Scanned PDFs with no text layer cannot be read: there is no OCR. The system
says so rather than storing an empty document.

**Notes** are written here: meeting notes, decisions, processes, anything worth
keeping. They are indexed alongside documents.

**Ask a question** (`/knowledge/assistant`) answers from your records in plain
language, and **every answer cites the records it came from** — click through
and read the source. When your records do not contain the answer it says so
rather than guessing.

It searches only what you are allowed to see, and only the company you are
currently in.

## Reports

Twelve reports across money, delivery, growth and the ParFax platform. Each
states its source and the period, and can be exported to CSV or printed.

## ParFax Admin

For ParFax specifically: platform users, locations, scans, support issues and
metrics.

**Users** can be searched and filtered by plan, status or activity. An
administrator can suspend or reinstate an account, grant promotional access,
correct a field, or merge duplicates — each with a reason, each recorded, each
showing the value before and after.

**Metrics** are labelled with where they came from: *Raw* and *Calculated* come
from platform data; *Manual*, *Forecast* and *Target* are entered by a person
and show who entered them and what they said the source was. You cannot type in
a raw or calculated figure — that is the point of the labels.

**Annotations** explain a change in the numbers — a launch, an outage, a
campaign — so a spike has a reason attached next time someone looks.

## Integrations

Each card shows its real state. **Disconnected** means not connected.
**Connected** appears only after a real call to that provider has succeeded,
and shows the account it connected to. **Demo Mode** is sample data, badged in
gold, with no connection at all.

Connect one, test it, and sync. Every run is recorded: what was read, what was
written, what conflicted.

If a record changed both here and at the provider, it is reported as a conflict
for you to resolve, not overwritten.

See `INTEGRATIONS.md` for what each one needs.

## Settings

- **Profile** — your details, time zone, password.
- **Members** — invite people, set roles per company, deactivate. An invitation
  produces a one-time temporary password shown once; pass it on safely. The
  last Holdings Owner cannot be removed.
- **Sessions** — where you are signed in; revoke any of them.
- **Roles & permissions** — the full matrix of who can do what.
- **Import data** — CSV import with mapping, a preview of what will happen, and
  a rollback if it goes wrong.
- **Audit log** — everything that changed, who changed it and why.
- **Demo data** — clear the sample data, or rebuild it.

## Importing a CSV

1. **Settings → Import data**, choose what you are importing.
2. Upload. Columns are matched to fields automatically where the names are
   recognisable.
3. Fix the mapping. Anything unmatched is left unmapped rather than guessed.
4. **Preview.** Every row that would fail is listed with the reason. Valid rows
   still import; one bad line does not stop the job.
5. Import. If it was wrong, **roll it back** — every row from that import is
   removed.

Rows matching an existing record update it rather than creating a duplicate.

## Adding a company

**Companies → New company.** Name, slug, colours, currency, time zone. It
appears in the switcher immediately, with its own workspace and its own data.
No code change, no migration, no deployment.

## Light and dark

Under your avatar. It follows your system setting unless you choose.

## On a phone

### In a browser

Everything works. The navigation is behind the menu button, numbers sit
two-up, and tables scroll. Reading, checking, approving, adding a task or a
note is comfortable. The boards, the finance tables and the import wizard are
better on a laptop — they are dense by nature.

### The app

There is also an iOS and Android app. Same sign-in, same companies, same
permissions — it is the same system, not a copy of it, so a change made on the
phone is on the laptop before you have put it down.

Five tabs along the bottom: **Home**, **Tasks**, **CRM**, **Calendar** and
**More**. The **+** in the corner creates a task, note, contact, meeting,
investor, partnership or document from wherever you are. The workspace
switcher is top left, exactly as on the web.

Worth knowing:

- **Face ID or your fingerprint** can be required each time the app opens.
  Settings → Unlocking. Off until you turn it on.
- **Dictate a note** with the microphone button. It is transcribed on the
  phone; the audio goes nowhere.
- **Photograph a document** and it uploads to the same place as a file
  dropped on the web — same folders, same access levels.
- **No signal is fine.** Records you have looked at recently stay readable and
  say when they were last fetched. New tasks and notes queue up and send
  themselves when you are back on. The **Sync** screen (under More) shows what
  is waiting, and anything the server refused, with the reason.
- **Notifications** need turning on once, under Settings. If the server is not
  set up to send them, the screen says so rather than offering a switch that
  does nothing.

Imports, financial reporting, integration setup, permissions, the organization
chart and the audit log are deliberately not on the phone. They need room to
be done carefully.
