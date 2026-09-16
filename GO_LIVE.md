# Going live, step by step

Putting the Command Center on the internet, free, on Netlify and Supabase.
About twenty minutes, most of it waiting.

`DEPLOYMENT.md` explains the reasoning and the alternatives. This is the
checklist.

Two accounts are needed and neither takes a card:
[supabase.com](https://supabase.com) and [netlify.com](https://netlify.com).

---

## 1. The database — Supabase

1. **New project.** Name it anything. Choose a region near you. It sets a
   database password — **save it in your password manager now**; it is shown
   once and you need it in a moment. Starting the project takes a minute or two.
2. **Settings → Database → Connection pooling.** Copy the **Transaction**
   pooler connection string. Replace `[YOUR-PASSWORD]` in it with the password
   from step 1. Append `?sslmode=require` if it is not already there.

   Take the pooler string, not the direct one. A serverless host opens many
   short-lived connections; a direct connection runs out of them under load,
   and that shows up as intermittent failures rather than a clean error.
3. **Settings → API.** Copy the **Project URL** and the **`service_role`**
   key. Not the `anon` key — that one is meant to be public and cannot do what
   the application needs.
4. **Storage → New bucket.** Name it `command-center`. Leave it **private**;
   the application serves files through its own authorized route and checks
   permission on every read.

## 2. The secrets — on your own machine

```bash
npm run gen:secrets
```

Writes **`apps/web/.env.production.local`**, which is git-ignored. The leading
dot hides it in Finder and Explorer, so the command prints the exact line that
opens it — on a Mac that is:

```bash
open -e apps/web/.env.production.local
```

Paste in the four Supabase values from step 1, and leave `APP_URL` blank for
now.

**Keep a copy in your password manager.** If `ENCRYPTION_KEY` is lost, stored
integration credentials cannot be decrypted. If `AUTH_SECRET` is lost,
everyone is signed out. Neither can be recovered from the database.

## 3. The schema and your account

```bash
DATABASE_URL="<the pooler string>" npm run db:migrate
DATABASE_URL="<the pooler string>" npm run db:seed -- --no-demo
```

`--no-demo` matters: it creates the holding company, the two companies and
your owner account, and no sample data.

## 4. Check before you deploy

```bash
npm run check:deploy
```

It reads the file from step 2, connects to the database, confirms the schema
and your account are there, and writes, reads back and deletes one test file
in the bucket — because the only honest test of an upload is an upload.

Every failure names the command or the click that fixes it. Do not go on until
it is green.

## 5. The site — Netlify

1. **Add new site → Import an existing project → GitHub**, and pick
   `Aaronse503/Eisman-Group`.
2. **Branch to deploy:** `claude/eisman-command-center-1k6yd3`.
3. **If it asks which package or for a base directory, leave it at the
   repository root.** Do not set it to `apps/web`. `netlify.toml` at the root
   already says what to build and where the result is, and pointing Netlify
   inside the workspace stops the shared packages from installing.
4. **Do not deploy yet.** Go to **Site configuration → Environment variables →
   Add a variable → Import from a .env file**, and paste the whole contents of
   `.env.production.local`.
5. **Deploy.** The first build takes three or four minutes.
6. Once you have the URL, set `APP_URL` to it in the environment variables and
   redeploy. Links inside notifications need it.

## 6. First sign-in

Open the site, sign in as `aaron@eismandigital.com` with `ChangeMe123!`. It
will require a real password before anything else opens. Then:

- **Settings → Audit log** — your own sign-in should be there. If it is, the
  audit trail is working.
- **Settings → Members** — invite anyone else, with the role each needs. Each
  invitation produces a one-time password shown once; pass it on through
  something safe, not email.
- **Integrations** — connect one provider at a time and test each.

## 7. Back it up

This is the part not to skip, and the one thing the free tier does not do for
you.

The audit log cannot be reconstructed and neither can uploaded documents.
Everything else could in principle be re-synced from its source; those two
could not.

```bash
pg_dump --format=custom "$DATABASE_URL" > eisman-$(date +%F).dump
```

Weekly, kept somewhere other than Supabase. Test restoring one into a scratch
database once — an untested backup is a belief, not a backup.

When the records in there become ones you would genuinely miss, Supabase's
paid tier adds automatic backups and stops the database pausing. That is a
plan change on the same account, not a migration.

## 8. The phone app

`EXPO_PUBLIC_API_URL` is baked into a build, so the app has to be rebuilt to
point at the new site instead of a laptop. In `apps/mobile/eas.json`, set it
to your site URL in the `preview` and `production` profiles, then build. See
`MOBILE.md`.

---

## If something goes wrong

| What you see | What it means |
| --- | --- |
| Build fails on `npm install` | Base directory was set to `apps/web`. Clear it back to the repository root. |
| Site loads but every page errors | Almost always a missing environment variable. The deploy log names it — the application refuses to start rather than half-working. |
| "Too many connections" | The direct connection string instead of the pooler. |
| Uploads vanish | `STORAGE_DRIVER` is not `supabase`. The application refuses to start on a serverless host in that state, so you would see a startup error rather than silent loss. |
| Site is slow to wake | A free Supabase database suspends after about a week idle. The first request wakes it. |
