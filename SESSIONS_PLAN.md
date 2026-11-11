# Plan: sessions with a shareable join link and a private admin link

> **Status:** decisions 1, 2, 3 and 4 are settled, and 5 (EmailJS) needs a follow-up before Phase 6 (see [Decisions](#decisions)). Phase 0 (setup) is nearly done: the app is deployed as a Cloudflare Worker and Supabase is ready. The dry-run build variable and a check from an unblocked network are left.
> File paths are relative to the repo root. Line numbers refer to the code at the time of writing.

## Goal

Anyone can create a session without an account. The creator gets two links: a **join link** to share with participants and a private **admin link**. Participants open the join link and enter their data (name, email, optional gift idea), same as today. Afterwards the creator opens the admin link and closes the session, then runs the existing flow: roll / re-roll, confirm, send emails, retry failed.

## Why this needs a backend

All state lives in one browser tab. Participants are a `ref` in `useSecretSanta` (`src/composables/useSecretSanta.ts:29-55`), and the README says nothing is stored (`README.md:3`). Participants on other devices can't write into the admin's tab, so we need a shared store and a publicly reachable site.

A no-backend workaround (participants email their data to the admin, who pastes it in) was rejected: it gives no live list and no real "close".

## Recommended architecture

- **Supabase** (hosted Postgres, Row Level Security, RPC functions) stores sessions and participants. Supabase Auth is not used because there are no accounts.
- **Cloudflare Workers** (free, static assets, built from GitHub by Workers Builds) serves the Vue app. A Worker returns 404 for unknown paths unless `assets.not_found_handling` is `single-page-application`, so Phase 1 adds a Wrangler config for the `/join/...` and `/admin/...` deep links ([docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).
- **Unchanged:** the draw, delivery queue, EmailJS sending, validation and message building still run in the admin's browser, so silent mode stays private. Pairings are never stored.

Alternatives considered:

- **Own Node + SQLite server:** full control and server-side email, but you run hosting, auth and backups.
- **Cloudflare Pages Functions + D1:** free and one repo, but the API and auth are hand-written.
- **Firebase:** uniqueness and state rules are clumsy in security rules.

## Target flow

1. Anyone opens the site, creates a session (title, optional note) and gets a private admin link (`…/admin/<id>#<secret token>`) and a join link to share: `…/join/<unguessable id>`.
2. Participants open the join link and fill the same form (name, email, optional gift). They see a confirmation and nobody else's data.
3. The creator opens the admin link, refreshes to see the list, and can add or remove people. **Close session** stops all joins and freezes the list.
4. The existing flow runs unchanged: roll, re-roll, confirm, send, retry failed.
5. When all emails are delivered the session becomes `completed`, and the participant data can be deleted. Sessions also expire automatically (see Data and rules).

Status is `open ⇄ closed → completed`, enforced in the database.

There are no accounts: whoever holds the admin link is the admin of that session. The token sits in the URL fragment, so it never reaches host logs or `Referer` headers, and the creating browser remembers it in `localStorage`. Only a hash of the token is stored in the database. A lost admin link can't be recovered.

## Data and rules

- **`sessions`:**
  - `id uuid` (random, so the join link is an unguessable capability)
  - `admin_token_hash`, `title`, optional `description`
  - `status`, timestamps, `draw_started_at`
- **`participants`:**
  - `id bigint identity`, so `Participant.id: number` stays and `draw`/`delivery` need no type changes
  - `session_id` (cascade delete), `name`, `email`, `gift`
- **Database-enforced rules,** mirroring `src/lib/validation.ts:3-4` and `src/lib/validation.ts:21-52`:
  - length limits and no control characters
  - unique `lower(name)` and `lower(email)` per session
  - max 100 participants
  - joining only while `open`
- **Access (RPC only, no accounts):**
  - Row Level Security is on for both tables, with no policies and no table privileges for `anon`. Everything goes through `security definer` RPCs with an explicit `grant execute`.
  - Public RPCs: `create_session(title, description)` (returns the id and the admin token once), `get_public_session(id)` and `join_session(id, name, email, gift)`.
  - Admin RPCs take `(session_id, admin_token)`: read the session and participants, add, remove, close, reopen, mark the draw started, complete, delete. A wrong token gives the same "not found" answer as an unknown id.
- **Abuse limits and retention** (anyone can create sessions and join):
  - per-IP throttles on `create_session` and `join_session` (client IP read from the request headers inside the RPC, to verify in Phase 2), a global cap on open sessions, and the 100-participant cap per session
  - sessions are deleted automatically 60 days after creation by a scheduled job (for example `pg_cron`, to verify in Phase 2), which also bounds how long personal data is kept; the 60 days are a proposal
  - add a CAPTCHA (for example Cloudflare Turnstile) only if abuse shows up
- **Race rule:** Close flips the status atomically first. `join_session` checks `open` under a row lock. The admin fetches the list only after Close succeeds, so nobody can join and then be missed by the draw.

## Phases

### Phase 0: setup (you), nearly done

No code changes. The goal is to have the current app online and a Supabase project ready. Phase 1 doesn't depend on this and can run in parallel.

1. **Deploy the current app to Cloudflare** (deployed, dry-run still to do):
   - The dashboard created a Worker with static assets, built from this repository by Workers Builds, at `https://secretsanta.tokmakov-musubi.workers.dev`. The repo has no Wrangler config yet, so the build and deploy commands exist only in the dashboard (Settings > Build). Phase 1 adds the config.
   - Add the build variable `VITE_EMAILJS_DRY_RUN=true` under **Settings > Build > Build variables and secrets**, then retry the build. Vite only sees build variables, not the runtime Variables & Secrets, and the value is baked in at build time ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)). If the page has separate Production and Preview sections, add it to both. No EmailJS keys go online and no email is sent.
   - **Done when:** the URL, opened from a network that doesn't block it, loads with the dry-run banner and a 3-person draw works end to end.
   - **Known issue:** the work network's web filter blocks this hostname ("Web Page Blocked"), so the site can't be tested from that network. Test from a personal device or network, and see the host risk under decision 3.
2. **Create a Supabase project** (free, done), in the region closest to your participants:
   - Save the database password in a password manager.
   - Copy the **Project URL** and the **publishable key** (`sb_publishable_…`) from the project's Connect dialog (or Settings > API Keys). The legacy `anon` key is being deprecated ([API keys](https://supabase.com/docs/guides/getting-started/api-keys)).
   - Nothing to configure for Auth.
   - Checked: the Auth health endpoint answers when called with the publishable key, so the project is live and the key is accepted.
3. **Send me** the app URL, the Project URL and the publishable key (received, and kept out of the repo until Phase 2 sets them as Cloudflare build variables). All three are public by design. Never share the database password or a `sb_secret_…` or `service_role` key.

### Phase 1: foundations, no behavior change

- Add `vue-router` (history mode). `App.vue` becomes a shell, and today's flow moves to `/quick`.
- Add `wrangler.jsonc` with `name` `secretsanta` (it must match the Worker's name in the dashboard), `compatibility_date` set to the day of writing, `assets.directory` `./dist` and `assets.not_found_handling` `single-page-application`. Without SPA mode, `/join/...` and `/admin/...` deep links return 404 on a Worker; whether the current dashboard-only deploy has it is unchecked. Confirm that the Deploy command in Settings > Build is `npx wrangler deploy`, so it uses the file.
- Extract the roll, review and delivery cards into a `DrawPanel` component for reuse.
- Add a `SessionApi` interface and an `InMemorySessionApi` fake. This uses the same injection style as `send`, `sleep` and `randomInt`.
- Make `ParticipantForm` submit asynchronously and show server errors such as "email taken" or "session closed". Make `ParticipantList` removal optional or read-only.
- Add an additive `setParticipants()` to `useSecretSanta`, so its sync API and tests stay valid.
- **Done when:** all existing tests pass, typecheck is clean, and reloading a deep link such as `/quick` opens the app on the deployed URL (checked from an unblocked network).

### Phase 2: backend

- Commit the SQL migration: tables, constraints, RLS, the public and admin RPCs with explicit grants, the status-transition checks, the throttles and the expiry job.
- Add `SupabaseSessionApi` (RPC calls only, no table queries).
- Add a backend config with an `unconfigured` mode, like `MailConfig` (`src/lib/mailer.ts:41-58`), so the app still runs without Supabase. Env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, set as Cloudflare build variables (Vite ignores the `NEXT_PUBLIC_` names used in Supabase snippets).
- **Done when:**
  - scripted or pgTAP checks show `anon` has no direct table access, a wrong admin token behaves like an unknown session, and nobody can join a closed or full session
  - the database rejects bad data
  - the same contract tests pass against the fake and the real API

### Phase 3: join page (`/join/:id`)

- Show title and note, the reused form, and a success state.
- Handle not-found, closed and full states, and add a one-line privacy notice.
- Never list other participants.

### Phase 4: create and admin pages (`/` and `/admin/:id#token`, admin lazy-loaded)

- No login. The home page has a "Create session" form and a "Sessions on this device" list read from `localStorage`. After creating, show both links and warn: "Save the admin link. Anyone with it can manage this session, and it can't be recovered."
- A session page with:
  - share link and copy button
  - participant list (refresh on focus plus polling) with add and remove
  - **Close** (needs at least `MIN_PARTICIPANTS`), **Reopen** and **Delete session**
- The link base is `VITE_PUBLIC_URL`, falling back to `location.origin`. Without that, a session created on localhost produces a useless link.

### Phase 5: close, draw, complete

- On Close, fetch the frozen list, call `setParticipants`, and show `DrawPanel`.
- Set `draw_started_at` on confirm. Warn before any re-draw, because earlier emails would be invalidated.
- Mark `completed` when every email is delivered. Add "Delete session data".

### Phase 6: hardening, docs, deploy

- Handle the EmailJS exposure (see decision 5).
- Rewrite the README, including privacy notes: names and emails are now stored for up to 60 days, and admin links are kept in `localStorage` (`README.md:54`).
- Update `.env.example` (`.env.example:6-8`) with the Supabase values and `VITE_PUBLIC_URL`.

## Existing code that changes

- `src/App.vue:65-126`: the phase-driven body is split into views and `DrawPanel`.
- `src/main.ts:1-5`: install the router.
- `src/components/ParticipantForm.vue:17-25`: it validates and emits synchronously and ignores any result, so server errors can't be shown.
- `src/components/ParticipantList.vue:17-24`: the Remove button is always shown.
- `src/App.test.ts:62-163`: retarget these tests to the new views. Don't delete them.
- The draw, delivery, message and validation logic and their tests stay untouched.

## Decisions

1. **Backend:** Supabase. Settled.
2. **Admin model:** a secret admin link per session, no accounts, and anyone can create a session. Settled. This replaces the single admin login from the first draft; Data and rules describes the consequences (RPC-only access, hashed admin token, abuse limits, automatic expiry).
3. **Host:** a free host for the pilot, deploying the current app first (Phase 0). Settled: **Cloudflare Workers** with static assets (the dashboard created a Worker, not a Pages project):
   - Free plan: requests to static assets are free and unlimited ([billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)), and Workers Builds allows 3,000 build minutes per month with 1 concurrent build ([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).
   - SPA routing needs one Wrangler config (Phase 1).
   - **Risk:** corporate web filters can block `workers.dev` hostnames, and the work network here blocks the current one. If participants will open the link from corporate networks, test the join link from those networks before launch. A custom domain is the fallback.
   - Netlify's free plan is a 300-credit hard cap where each production deploy costs 15 credits. That allows at most 20 production deploys a month (fewer once traffic is counted), and when the credits run out every project is paused ([credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)).
4. **Keep the current local flow at `/quick`:** yes. Settled.
5. **EmailJS exposure: needs a follow-up before Phase 6.**
   - **The problem:** the template uses `{{to_email}}` and `{{message}}` (`README.md:22-24`). Once the site is public, anyone who copies the bundled key could send arbitrary text to arbitrary addresses from the owner's mailbox. Sessions created by anyone also share the owner's EmailJS quota (200 requests per month on the free plan, `README.md:43`).
   - **The earlier default fix no longer fits.** It assumed one owner login that could load the EmailJS values from an owner-only database row. With link-based admins anyone can get an admin token by creating a session, so such a row would protect nothing.
   - **Proposed replacement:**
     - Pilot: set the EmailJS origin allow-list to the `workers.dev` domain before putting the EmailJS values in the build variables, keep the pilot URL unlisted, and stay in dry-run until then.
     - Before a public launch: bring-your-own EmailJS credentials per admin, entered in the admin page and kept only in that browser (`readMailConfig` already takes a plain record), or a server-side sender.

Out of scope for now: participant self-edit or withdraw, exclusion rules (such as couples), deadline auto-close, confirmation emails to joiners, QR code, recovering a lost admin link.

**Caveat:** Supabase free projects are paused after 1 week of low activity (a few requests a day usually prevent it), can be resumed from the dashboard for up to a year, and are limited to 2 active projects and 500 MB ([pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [pricing](https://supabase.com/pricing)). Resume the project before sharing a link after a quiet period.

## Verification

- `npm run typecheck`, `npm test` and `npm run build` stay green after every phase.
- Tests never touch the network. They use the fake API and dry-run, like `vite.config.ts:8`.
- Manual end-to-end check with two browser profiles:
  1. Create a session without signing in.
  2. Join as three people, and confirm a duplicate is rejected.
  3. Close the session, and confirm joining then fails.
  4. Roll, re-roll and send in dry-run.
  5. Reload and confirm the session shows `completed` with no pairing stored.

## Next step

Finish Phase 0: add the dry-run build variable, retry the build, and check the site from a network that doesn't block it. Phase 1 can start in parallel on a branch, because it needs no backend access.
