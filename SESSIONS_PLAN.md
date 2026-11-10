# Plan: admin-created sessions with a shareable join link

> **Status:** draft, waiting for decisions 1-5 (see [Decisions](#decisions)).
> File paths are relative to the repo root. Line numbers refer to the code at the time of writing.

## Goal

An admin creates a session and gets a link to share. Participants open the link and enter their data (name, email, optional gift idea), same as today. Afterwards the admin returns to the site and closes the session, then runs the existing flow: roll / re-roll, confirm, send emails, retry failed.

## Why this needs a backend

All state lives in one browser tab. Participants are a `ref` in `useSecretSanta` (`src/composables/useSecretSanta.ts:29-55`), and the README says nothing is stored (`README.md:3`). Participants on other devices can't write into the admin's tab, so we need a shared store and a publicly reachable site.

A no-backend workaround (participants email their data to the admin, who pastes it in) was rejected: it gives no live list and no real "close".

## Recommended architecture

- **Supabase** (hosted Postgres, Row Level Security, Auth) stores sessions and participants.
- **Static hosting** (Netlify, Vercel or Cloudflare Pages) serves the Vue app, with an SPA fallback rewrite.
- **Unchanged:** the draw, delivery queue, EmailJS sending, validation and message building still run in the admin's browser, so silent mode stays private. Pairings are never stored.

Alternatives considered:

- **Own Node + SQLite server:** full control and server-side email, but you run hosting, auth and backups.
- **Cloudflare Pages Functions + D1:** free and one repo, but the API and auth are hand-written.
- **Firebase:** uniqueness and state rules are clumsy in security rules.

## Target flow

1. The admin signs in, creates a session (title, optional note) and gets `…/join/<unguessable id>`.
2. Participants open the link and fill the same form (name, email, optional gift). They see a confirmation and nobody else's data.
3. The admin refreshes the session page and sees the list, which can be added to or removed from. **Close session** stops all joins and freezes the list.
4. The existing flow runs unchanged: roll, re-roll, confirm, send, retry failed.
5. When all emails are delivered the session becomes `completed`, and the participant data can be deleted.

Status is `open ⇄ closed → completed`, enforced in the database.

## Data and rules

- **`sessions`:**
  - `id uuid` (random, so the link is an unguessable capability)
  - `owner_id`, `title`, optional `description`
  - `status`, timestamps, `draw_started_at`
- **`participants`:**
  - `id bigint identity`, so `Participant.id: number` stays and `draw`/`delivery` need no type changes
  - `session_id` (cascade delete), `name`, `email`, `gift`
- **Database-enforced rules,** mirroring `src/lib/validation.ts:3-4` and `src/lib/validation.ts:21-52`:
  - length limits and no control characters
  - unique `lower(name)` and `lower(email)` per session
  - max 100 participants
  - joining only while `open`
- **RLS:**
  - Anonymous users get no table access. They can only call `get_public_session(id)` and `join_session(id, name, email, gift)`.
  - The owner (admin) can read and delete their own sessions and participants.
- **Race rule:** Close flips the status atomically first. `join_session` checks `open` under a row lock. The admin fetches the list only after Close succeeds, so nobody can join and then be missed by the draw.

## Phases

### Phase 0: setup (you)

Create the Supabase project, disable public sign-ups, create the admin user, pick the host.

### Phase 1: foundations, no behavior change

- Add `vue-router` (history mode). `App.vue` becomes a shell, and today's flow moves to `/quick`.
- Extract the roll, review and delivery cards into a `DrawPanel` component for reuse.
- Add a `SessionApi` interface and an `InMemorySessionApi` fake. This uses the same injection style as `send`, `sleep` and `randomInt`.
- Make `ParticipantForm` submit asynchronously and show server errors such as "email taken" or "session closed". Make `ParticipantList` removal optional or read-only.
- Add an additive `setParticipants()` to `useSecretSanta`, so its sync API and tests stay valid.
- **Done when:** all existing tests pass and typecheck is clean.

### Phase 2: backend

- Commit the SQL migration: tables, constraints, RLS, RPCs and the status-transition trigger.
- Add `SupabaseSessionApi`.
- Add a backend config with an `unconfigured` mode, like `MailConfig` (`src/lib/mailer.ts:41-58`), so the app still runs without Supabase.
- **Done when:**
  - scripted or pgTAP checks show anon can't read participants and can't join closed or full sessions
  - the database rejects bad data
  - the same contract tests pass against the fake and the real API

### Phase 3: join page (`/join/:id`)

- Show title and note, the reused form, and a success state.
- Handle not-found, closed and full states, and add a one-line privacy notice.
- Never list other participants.

### Phase 4: admin area (`/admin/*`, lazy-loaded)

- Login with a route guard, and a dashboard to list, create and delete sessions.
- A session page with:
  - share link and copy button
  - participant list (refresh on focus plus polling) with add and remove
  - **Close** (needs at least `MIN_PARTICIPANTS`) and **Reopen**
- The link base is `VITE_PUBLIC_URL`, falling back to `location.origin`. Without that, a session created on localhost produces a useless link.

### Phase 5: close, draw, complete

- On Close, fetch the frozen list, call `setParticipants`, and show `DrawPanel`.
- Set `draw_started_at` on confirm. Warn before any re-draw, because earlier emails would be invalidated.
- Mark `completed` when every email is delivered. Add "Delete session data".

### Phase 6: hardening, docs, deploy

- Add the EmailJS origin allow-list (see decision 5).
- Rewrite the README, including privacy notes: names and emails are now stored, and the admin login lives in `localStorage` (`README.md:54`).
- Update `.env.example` (`.env.example:6-8`) and add the SPA-fallback config for the host.

## Existing code that changes

- `src/App.vue:65-126`: the phase-driven body is split into views and `DrawPanel`.
- `src/main.ts:1-5`: install the router.
- `src/components/ParticipantForm.vue:17-25`: it validates and emits synchronously and ignores any result, so server errors can't be shown.
- `src/components/ParticipantList.vue:17-24`: the Remove button is always shown.
- `src/App.test.ts:62-163`: retarget these tests to the new views. Don't delete them.
- The draw, delivery, message and validation logic and their tests stay untouched.

## Decisions

Defaults are in bold.

1. **Backend:** **Supabase**, or a custom server.
2. **Admin login:** **one email+password account with sign-ups disabled**, or a secret admin link per session. The link option needs no login, but anyone could then create sessions on a public site.
3. **Host:** Netlify, Vercel or Cloudflare Pages. Any works with a rewrite file. Which one?
4. **Keep the current local flow at `/quick`:** **yes**. It costs almost nothing because the composable is unchanged.
5. **EmailJS exposure:**
   - **The problem:** the template uses `{{to_email}}` and `{{message}}` (`README.md:22-24`). Once the site is public, anyone who copies the bundled key could send arbitrary text to arbitrary addresses from the admin's mailbox.
   - **Default fix:** **both** the origin allow-list and moving the three EmailJS values into an owner-only database row loaded after login. This is cheap because `readMailConfig` already takes a plain record.
   - **Alternative:** only the allow-list.

Out of scope for now: participant self-edit or withdraw, exclusion rules (such as couples), deadline auto-close, confirmation emails to joiners, QR code, multiple admins.

**Caveat:** Supabase free projects auto-pause after a period of inactivity (verify the current policy). Un-pause the project before sharing the link.

## Verification

- `npm run typecheck`, `npm test` and `npm run build` stay green after every phase.
- Tests never touch the network. They use the fake API and dry-run, like `vite.config.ts:8`.
- Manual end-to-end check with two browser profiles:
  1. Create a session.
  2. Join as three people, and confirm a duplicate is rejected.
  3. Close the session, and confirm joining then fails.
  4. Roll, re-roll and send in dry-run.
  5. Reload and confirm the session shows `completed` with no pairing stored.

## Next step

Answer decisions 1-5 (or accept the defaults), then start Phase 1.
