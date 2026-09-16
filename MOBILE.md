# The mobile application

An iOS and Android app for the Command Center, built with Expo and React
Native. It is a second way into the same system, not a second system: the same
server, the same database, the same session, the same permissions and the same
row-level security. There is no mobile database.

It is built for the things worth doing on a phone — checking figures, clearing
tasks, looking someone up before a meeting, capturing a note or a document
while it is in your hand. Everything heavier stays on the desktop.

## What is on the phone

| Screen | What it does |
| --- | --- |
| **Home** | Holdings figures for the workspace you are in, what is overdue, what is next, and recent activity |
| **Tasks** | Your work across every company, filtered by view; complete a task in one tap |
| **CRM** | Clients and contacts, searchable, with the detail behind each |
| **Calendar** | What is coming up, with agendas and notes |
| **More** | Pipelines, ParFax, search, sync status and settings |
| **Quick Create** | Task, note, contact, meeting, investor, partnership or document, from anywhere |

Global search covers clients, contacts, organizations, tasks, meetings,
documents, notes, partnerships and — where you have the permission — investors
and ParFax users. It is the same search the web application uses.

## What stays on the desktop

Deliberately not on the phone: bulk imports, detailed financial reporting,
integration setup, permission and role management, org-chart editing, the
audit log and demo-data administration. These need room and care, and a
mis-tap on a small screen is not the place for them. The mobile app links to
the web application where one of them is the next step.

## Running it in development

```bash
npm install
npm run dev                      # the API the app talks to, on :3000
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3000 npm run mobile
```

Then open the QR code in Expo Go, or in a development build. `localhost` is the
phone itself, so a device on your network needs your machine's LAN address.

`npm run mobile -- --web` opens the app in a browser. That is a development
convenience for checking layout and wiring, not the product: there is no
keychain and no push notification service in a browser, and the app says so
rather than pretending otherwise.

## Builds

Development and internal builds go through EAS. Nothing is published to the
App Store or Google Play.

```bash
cd apps/mobile
npx eas login
npx eas init                     # creates the project and fills in EAS_PROJECT_ID
npm run build:dev:ios            # simulator build
npm run build:dev:android        # APK for a device
```

`eas.json` has four profiles: `development` (simulator, dev client),
`development-device` (a real device), `preview` (internal distribution) and
`production`. Each sets `EXPO_PUBLIC_API_URL`; change the `preview` and
`production` values to your own domains before building with them.

**Nothing is submitted to either store.** `eas submit` is not wired up, and
the production profile builds an artefact only.

## Signing in and staying signed in

The session token is the same one the browser uses, carried as a bearer token
instead of a cookie, with the same expiry, the same revocation and the same
rate limiting. It is stored in the device keychain (iOS) or the
keystore-backed encrypted store (Android) — never in ordinary storage on a
device.

If the device has Face ID, Touch ID or a fingerprint set up, **Settings →
Unlocking** can require it each time the app opens. The app then starts on a
lock screen rather than on your data, so an unattended phone shows nothing.
Turning it on does not weaken the password: it is a second gate, not a
replacement.

A temporary password locks the API as well as the web application. The app
sends you to the web application to set a real one rather than offering a
password form on a phone.

## Working without a connection

Records you have looked at recently are cached on the device and shown
immediately, labelled with when they were last fetched, while a fresh copy is
requested. A stale figure is always marked as stale.

Tasks and notes can be created with no connection. Each queued change carries
an id generated on the device; the server records that id, so a change sent
twice after a lost response is applied once. The **Sync** screen shows what is
waiting, sends it on demand, and lists anything the server refused with the
reason — a refused change is never silently dropped.

The queue is sent automatically whenever the app returns to the foreground.

## Push notifications

Notifications are recorded in the database first — that row is what both
applications read and what the notification list shows. Pushing one to a phone
is a second, best-effort step.

Every attempt is recorded in `push_deliveries` with its outcome, so a
notification that never arrived can be told apart from one that was never
sent. A device the push service reports as unregistered has its token cleared,
which stops delivery at the source.

To make push delivery actually work you need, in this order:

1. An Expo account and `npx eas init` in `apps/mobile`, which fills in the
   project id. Without it the device cannot be issued a push token, and the
   app says exactly that instead of showing a toggle that does nothing.
2. Apple Push Notification credentials (EAS can generate these for you during
   an iOS build) and a Firebase Cloud Messaging server key for Android,
   uploaded with `npx eas credentials`.
3. A build made from that project. Expo Go cannot receive project-scoped push
   notifications.

Server-side, `PUSH_PROVIDER` defaults to `expo`. Set it to `none` to record
notifications without pushing them anywhere; the app then shows the reason on
the Settings screen and disables the toggle rather than appearing to work.
`EXPO_ACCESS_TOKEN` is only needed if your Expo project requires one to send.

**No credential is needed to read this file into a repository.** Create the
Expo account and the push credentials yourself, in Expo's own console; nothing
here asks for them to be pasted anywhere.

### Reminders

A reminder is a promise to tell someone something at a time, and until
something runs, it is only a row. `POST /api/v1/cron/reminders` turns reminders
that have come due into notifications, which then push. It authenticates with
`CRON_SECRET`; with no secret configured it refuses to run at all rather than
leaving an open endpoint that writes notifications to other people. See
`DEPLOYMENT.md` for the schedule.

## Deep links

The app's scheme is `eisman://`, and `expo-router` maps paths to screens, so
`eisman://task/<id>` opens a task.

A notification is written once, by the server, for both applications, so it
carries a web path such as `/tasks/<id>` along with the record it names.
`src/lib/deep-links.ts` translates both into a mobile route, and returns
nothing for anything the app has no screen for — a tapped notification then
leaves you where you are rather than opening a blank page.

## Camera, files and voice

- **Document scanning** uses the camera, then compresses the image before
  upload. It goes to the same document store, with the same access levels and
  the same size and type limits as the web upload.
- **Files** are chosen with the system picker. The app never browses your
  storage.
- **Voice notes** are transcribed on the device by the platform's own speech
  recogniser. Audio is not uploaded, and no transcription service is involved.

Each permission is requested at the moment it is needed, with a plain sentence
explaining why, and the app works without any of them — the feature that needs
one says what it needs rather than failing.

## Tablets and accessibility

iPad is supported. On a wide screen content is centred in a column rather than
stretched edge to edge, and the dashboard figures fall into two columns.

Every control is at least 44 points — the smallest target both Apple and
Google ask for — and carries an accessibility label. Light and dark both
follow the device unless you choose one in Settings.

## How it is put together

```
apps/mobile
  app/                 screens (expo-router: the file tree is the navigation)
    (tabs)/            Home, Tasks, CRM, Calendar, More
    create/            the Quick Create screens
  src/
    components/ui.tsx  the shared controls
    lib/
      api.ts           the single API client for the app
      session.tsx      who is signed in, what they may do, locked or not
      offline.ts       the queue of changes made without a connection
      cache.ts         records kept for offline reading
      storage.ts       keychain for the token, ordinary storage for the cache
      biometrics.ts    Face ID / Touch ID / fingerprint
      notifications.ts push registration and where a tapped one goes
      deep-links.ts    web path or record → mobile route
    theme/             the shared design tokens, light and dark
```

The types, validation schemas, permission rules, formatting and design tokens
come from `packages/shared`, and the API client from `packages/api-client` —
both shared with the web application, so an endpoint that changes shape fails
to compile on both sides rather than at runtime on someone's phone.

## Tests

```bash
npm run test --workspace @eisman/mobile
```

Covers the offline queue and the deep-link map — the parts that are plain
logic and the parts a person has to be able to trust without looking. The
screens are checked by driving the app itself.
