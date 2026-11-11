# Plan: sessions with a shareable join link and a private admin link

> **Status:** decisions 1 to 5 are settled, and decision 4 has one consequence to confirm (see [Decisions](#decisions)). Phase 0 (setup) is done: the app is deployed as a Cloudflare Worker in dry-run mode and Supabase is ready. Phase 1 (foundations) is built on branch `feat/new-flow`; its one open check is `/quick` on the deployed URL. Phase 2 is next.
> File paths are relative to the repo root. Line numbers refer to the code at the time of writing.

## Goal

Anyone can create a session without an account. The creator gets two links: a **join link** to share with participants and a private **admin link**. Participants open the join link and enter their data (name, email, optional gift idea), same as today. Afterwards the creator opens the admin link and closes the session, then runs the existing flow: roll / re-roll, confirm, send emails, retry failed.

## Why this needs a backend

All state lives in one browser tab. Participants are a `ref` in `useSecretSanta` (`src/composables/useSecretSanta.ts:29-55`), and the README says nothing is stored (`README.md:3`). Participants on other devices can't write into the admin's tab, so we need a shared store and a publicly reachable site.

A no-backend workaround (participants email their data to the admin, who pastes it in) was rejected: it gives no live list and no real "close".

## Recommended architecture

- **Supabase** (hosted Postgres, Row Level Security, RPC functions) stores sessions and participants. Supabase Auth is not used because there are no accounts.
- **Cloudflare Workers** (free, static assets, built from GitHub by Workers Builds) serves the Vue app. A Worker returns 404 for unknown paths unless `assets.not_found_handling` is `single-page-application`. The current deploy already serves the app for deep links like `/join/...`, and Phase 1 commits a Wrangler config so that stays pinned ([docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).
- **Mail route:** a script in the same Worker handles `POST /api/send` and is the only place that holds the EmailJS private key (see decision 5). Only `/api/*` requests run the script; the rest are static assets.
- **Unchanged:** the draw, delivery queue, validation and message building still run in the admin's browser, so silent mode stays private. Pairings are never stored. Only the sending moves to the mail route.

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
  - Mail RPC `authorize_send(session_id, admin_token, participant_id)`, meant for the mail route: it returns that participant's name and email only if the token is valid, the status is `closed` with the draw started, the participant belongs to the session and the send cap isn't reached, and it counts the send. The recipient therefore always comes from the database, never from the browser.
- **Abuse limits and retention** (anyone can create sessions and join):
  - per-IP throttles on `create_session` and `join_session` (client IP read from the request headers inside the RPC, to verify in Phase 2), a global cap on open sessions, and the 100-participant cap per session
  - a global daily cap on `authorize_send` and a per-session send cap (a few sends per participant), so abuse can't use up the 200 EmailJS requests per month; values to settle in Phase 2
  - sessions are deleted automatically 60 days after creation by a scheduled job (for example `pg_cron`, to verify in Phase 2), which also bounds how long personal data is kept; the 60 days are a proposal
  - add a CAPTCHA (for example Cloudflare Turnstile) only if abuse shows up
- **Race rule:** Close flips the status atomically first. `join_session` checks `open` under a row lock. The admin fetches the list only after Close succeeds, so nobody can join and then be missed by the draw.

## Phases

### Phase 0: setup (you), done

No code changes. The goal is to have the current app online and a Supabase project ready. Phase 1 doesn't depend on this and can run in parallel.

1. **Deploy the current app to Cloudflare** (done):
   - The dashboard created a Worker with static assets, built from this repository by Workers Builds, at `https://secretsanta.tokmakov-musubi.workers.dev`. Build command `npm run build`, Deploy command `npx wrangler deploy` (the dashboard defaults). The repo has no Wrangler config, so these settings live only in the dashboard.
   - The build variable `VITE_EMAILJS_DRY_RUN=true` is set under **Settings > Build > Build variables and secrets**. Vite only sees build variables, not the runtime Variables & Secrets, and the value is baked in at build time ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)). No EmailJS keys go online and no email is sent.
   - Checked: the deployed bundle is byte-identical (same SHA-256) to a local build with `VITE_EMAILJS_DRY_RUN=true`, and that is the only `VITE_` value in it. A deep link (`/join/test`) returns the app, so SPA fallback already works on the deployed Worker.
   - The work network's web filter blocked this hostname at first ("Web Page Blocked") and no longer did on a later check. Participants use personal devices, so it doesn't affect them. If the block returns, test from a personal device.
2. **Create a Supabase project** (free, done), in the region closest to your participants:
   - Save the database password in a password manager.
   - Copy the **Project URL** and the **publishable key** (`sb_publishable_…`) from the project's Connect dialog (or Settings > API Keys). The legacy `anon` key is being deprecated ([API keys](https://supabase.com/docs/guides/getting-started/api-keys)).
   - Nothing to configure for Auth.
   - Checked: the Auth health endpoint answers when called with the publishable key, so the project is live and the key is accepted.
3. **Send me** the app URL, the Project URL and the publishable key (received, and kept out of the repo until Phase 2 sets them as Cloudflare build variables). All three are public by design. Never share the database password or a `sb_secret_…` or `service_role` key.

### Phase 1: foundations, no behavior change, built (deployed check open)

- Add `vue-router` (history mode). `App.vue` becomes a shell, and today's flow moves to `/quick`.
- Add `wrangler.jsonc` to pin what the dashboard-only deploy does today: `name` `secretsanta` (it must match the Worker's name in the dashboard), `compatibility_date` set to the day of writing, `assets.directory` `./dist` and `assets.not_found_handling` `single-page-application`. Deep links already work without it, so this is for reproducibility, not a fix. Compare with the latest build log if it shows a generated config. The Build and Deploy commands stay as they are. The file also needs an empty `"previews": {}` block: Workers Builds runs the Preview command (default `npx wrangler preview`) for every non-production branch, and that command fails without the block, which can be empty ([docs](https://developers.cloudflare.com/workers/previews/configuration/)).
- Extract the roll, review and delivery cards into a `DrawPanel` component for reuse.
- Add a `SessionApi` interface and an `InMemorySessionApi` fake. This uses the same injection style as `send`, `sleep` and `randomInt`.
- Make `ParticipantForm` submit asynchronously and show server errors such as "email taken" or "session closed". Make `ParticipantList` removal optional or read-only.
- Add an additive `setParticipants()` to `useSecretSanta`, so its sync API and tests stay valid.
- **Done when:** all existing tests pass, typecheck is clean, and reloading a deep link such as `/quick` opens the app on the deployed URL.
- **Status:** built on `feat/new-flow` and checked locally: typecheck, all tests, the production build, and `wrangler deploy --dry-run` with the new `wrangler.jsonc` (`compatibility_date` 2026-11-11). The first PR build failed with "missing a `previews` block", and adding `"previews": {}` is the documented fix. Still open: confirm the next PR build passes, reload `/quick` on the Preview URL or the deployed URL, and compare `wrangler.jsonc` with the latest Cloudflare build log if it shows a generated config. If the Preview build says "This Preview deployment has no active URLs", turn on the Worker's Version/Preview URLs (dashboard: Settings > Domains & Routes), or set `preview_urls` in `wrangler.jsonc` and redeploy production.
- **What later phases rely on:**
  - `vue-router` 5.5.0 is pinned exactly, in history mode. `/` and unknown paths redirect to `/quick` until Phase 4 adds the home page. `createAppRouter(history)` takes a history, so tests can use a memory one.
  - `src/lib/sessionApi.ts` has one method per public and admin RPC (not `authorize_send`, which belongs to the mail route), and `SessionApiError` with a `code` (`not_found`, `closed`, `full`, `invalid`, `conflict`, `rate_limited`, `unavailable`) and per-field messages. `toFormErrors` turns an error into form errors.
  - `src/lib/sessionApiContract.ts` holds the contract tests as `describeSessionApiContract(label, createApi)`. Phase 2 runs them against `SupabaseSessionApi` too. A full run makes about 20 `create_session` and 12 `join_session` calls, so the per-IP throttles need a test bypass or enough headroom.
  - `SESSION_LIMITS` in `src/lib/validation.ts` (title 80, description 500) are proposals, to settle with the SQL constraints in Phase 2. The description is single-line text: whitespace, including newlines, is collapsed.
  - `ParticipantForm` takes a `save` function (sync or async, returns the errors) instead of emitting `add`, plus a `submitLabel`. `ParticipantList` has a `removable` prop. `DrawPanel` takes the `useSecretSanta()` result as `santa`. `setParticipants()` loads a list, only while in the edit phase.
  - `src/testing.ts` has the shared jsdom helpers for component and view tests (`mountComponent`, `unmountAll`, `typeInto`, `button`, `settle`).

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

### Phase 6: server-side mail route

- Add a Worker script (for example `worker/index.ts`) and set `main` and `assets.run_worker_first: ["/api/*"]` in `wrangler.jsonc`. The Build and Deploy commands stay the same.
- `POST /api/send` takes `{ session_id, admin_token, participant_id, message }`, calls `authorize_send` over the Supabase REST API with the publishable key, then calls EmailJS `/send` with the recipient from the database and the private key as `accessToken`. It limits the message length, passes EmailJS's 429 through so the existing rate-limit retry in `src/lib/delivery.ts` still applies, and never logs bodies.
- Set `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY` and `EMAILJS_PRIVATE_KEY`, plus the Supabase URL and publishable key for the route, as runtime **Variables and Secrets** (not build variables). No `VITE_EMAILJS_*` value goes into the build. Previews don't inherit production variables or secrets (they need `previews.vars` and `npx wrangler preview base-config secret put <NAME>`), so by default a branch Preview can't send real email. The route should answer clearly when its secrets are missing.
- In `src/lib/mailer.ts` add a `server` mode that posts to `/api/send`. Per decision 4, `/quick` stays a preview with no real emails, so the `VITE_EMAILJS_DRY_RUN` build variable is removed once sessions can send.
- Last, in the EmailJS dashboard, turn on "Use Private Key" and "Allow EmailJS API for non-browser applications". After that, browser-only sends with the public key are rejected.
- **Done when:**
  - route tests with a fake `fetch` and a fake RPC cover a wrong token, a session that isn't closed, a participant from another session, the send cap and EmailJS error mapping
  - one real email arrives from the deployed site
  - a direct EmailJS call with only the public key is rejected

### Phase 7: docs and deploy

- Rewrite the README, including privacy notes: names and emails are now stored for up to 60 days, admin links are kept in `localStorage` (`README.md:54`), and each message passes through the mail route and EmailJS on its way (keep EmailJS history off).
- Update `.env.example` (`.env.example:6-8`) with the Supabase values and `VITE_PUBLIC_URL`.

## Existing code that changes

Phase 1 made the first five changes below. The `mailer.ts` change is Phase 6.

- `src/App.vue:65-126`: the phase-driven body is split into views and `DrawPanel`.
- `src/main.ts:1-5`: install the router.
- `src/components/ParticipantForm.vue:17-25`: it validates and emits synchronously and ignores any result, so server errors can't be shown.
- `src/components/ParticipantList.vue:17-24`: the Remove button is always shown.
- `src/App.test.ts:62-163`: retarget these tests to the new views. Don't delete them.
- `src/lib/mailer.ts:41-58`: `MailConfig` gets a `server` mode that posts to `/api/send` (Phase 6). A new `worker/` script holds the route.
- The draw, delivery, message and participant validation logic and their existing tests stay unchanged. Phase 1 only added to `src/lib/validation.ts` and `src/composables/useSecretSanta.ts`.

## Decisions

1. **Backend:** Supabase. Settled.
2. **Admin model:** a secret admin link per session, no accounts, and anyone can create a session. Settled. This replaces the single admin login from the first draft; Data and rules describes the consequences (RPC-only access, hashed admin token, abuse limits, automatic expiry).
3. **Host:** a free host for the pilot, deploying the current app first (Phase 0). Settled: **Cloudflare Workers** with static assets (the dashboard created a Worker, not a Pages project):
   - Free plan: requests to static assets are free and unlimited ([billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)), and Workers Builds allows 3,000 build minutes per month with 1 concurrent build ([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)).
   - SPA routing is already on in the deployed Worker, and Phase 1 pins it in a Wrangler config.
   - **Risk:** corporate web filters can block `workers.dev` hostnames, and the work network did at first. Participants will use personal devices, so a custom domain isn't needed now. If that changes, test the join link from the participants' networks before launch.
   - Netlify's free plan is a 300-credit hard cap where each production deploy costs 15 credits. That allows at most 20 production deploys a month (fewer once traffic is counted), and when the credits run out every project is paused ([credits](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)).
4. **Keep the current local flow at `/quick`:** yes. Settled, with one consequence to confirm: the mail route authorizes every send against a session, and `/quick` has none. So on the deployed site `/quick` is a preview (draw and results, no real emails) and real emails need a session. The alternative, letting `/quick` send through the route without a session, would let anyone send through your EmailJS account.
5. **EmailJS exposure: settled, EmailJS is called from a Worker route with its private key.** You have no domain, and your Free EmailJS account shows both "Use Private Key" and "Allow EmailJS API for non-browser applications" under Account > Security (seen in the dashboard, not yet proven to work on the Free plan).
   - **The problem:** the template uses `{{to_email}}` and `{{message}}` (`README.md:22-24`). Once the site is public, anyone who copies the bundled key could send arbitrary text to arbitrary addresses from the owner's mailbox. EmailJS's FAQ calls an exposed Public Key harmless because it can only trigger predefined templates, but this template accepts any recipient and any text, so that argument doesn't apply. Sessions created by anyone also share the owner's EmailJS quota (200 requests per month on the free plan, `README.md:43`).
   - **The earlier default fix no longer fits.** It assumed one owner login that could load the EmailJS values from an owner-only database row. With link-based admins anyone can get an admin token by creating a session, so such a row would protect nothing.
   - **Design:**
     - The origin allow-list is not an option on the Free plan: EmailJS's pricing page lists "Whitelist" from the Personal plan ($9 per month) upwards. Even where available it reduces the exposure rather than removing it, because the key stays visible in the bundle. Keep all EmailJS values out of the deployed build, and stay in dry-run there.
     - Per-admin credentials were rejected, so sending moves to a small server route: a script in the same Cloudflare Worker, with the EmailJS values stored as runtime secrets (not build variables). Before each send the route calls `authorize_send` (see Data and rules), so the recipient comes from the database and only a session's admin can trigger sends to that session's participants. The draw and delivery queue stay in the browser. The route does not store pairings or log message bodies.
     - Provider: EmailJS called from the Worker with its private key. It needs no domain, history can stay off, and the 200 requests per month cover about ten sessions of 20 people, so the pilot fits. Swapping provider later only touches the route.
     - Fallback if the two options don't work on the Free plan after all: Gmail SMTP with an app password from the Worker (Google documents 500 emails per day for personal accounts; needs 2-Step Verification on a personal account). Resend and Brevo need a domain, and Cloudflare Email Service needs Workers Paid for arbitrary recipients.
     - **Order matters:** with "Use Private Key" on, EmailJS rejects browser-only sends. Keep it off while you test real emails locally with a `.env`, and switch both options on only at the end of Phase 6. Never paste the private key into chat or the repo; it goes in as a runtime secret.

Out of scope for now: participant self-edit or withdraw, exclusion rules (such as couples), deadline auto-close, confirmation emails to joiners, QR code, recovering a lost admin link.

**Caveat:** Supabase free projects are paused after 1 week of low activity (a few requests a day usually prevent it), can be resumed from the dashboard for up to a year, and are limited to 2 active projects and 500 MB ([pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [pricing](https://supabase.com/pricing)). Resume the project before sharing a link after a quiet period.

## Verification

- `npm run typecheck`, `npm test` and `npm run build` stay green after every phase.
- Tests never touch the network. They use the fake API and dry-run, like `vite.config.ts:8`, and the mail route is tested with a fake `fetch`.
- Manual end-to-end check with two browser profiles:
  1. Create a session without signing in.
  2. Join as three people, and confirm a duplicate is rejected.
  3. Close the session, and confirm joining then fails.
  4. Roll, re-roll and send in dry-run.
  5. Reload and confirm the session shows `completed` with no pairing stored.
  6. After Phase 6: send one real email to yourself from the deployed site, and confirm a direct EmailJS call with only the public key is rejected.

## Next step

Phase 0 is done and Phase 1 is built on `feat/new-flow`, with only its deployed-URL check open. Phase 2 is next, starting from the `SessionApi` contract tests.

In parallel, in the EmailJS dashboard (you): add the Email Service and create the template from `README.md:17-28` with history off. Real test sends from a local `.env` are optional; keep "Use Private Key" off while you do them, and switch both Security options on only at the end of Phase 6.
