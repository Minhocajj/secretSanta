# Secret Santa

A Vue 3 + TypeScript site for Secret Santa draws. It has two ways to run a draw:

- **Sessions** (`/`): anyone creates a session without an account and gets a **join link** to share and a private **admin link**. Participants enter their own name, email and optional gift idea. The organiser closes the session, rolls the dice, and every participant gets an email saying who they are Santa for. Data is stored in [Supabase](https://supabase.com) and emails are sent by a small Cloudflare Worker through [EmailJS](https://www.emailjs.com).
- **Quick draw** (`/quick`): the original single-device flow. Nothing is stored and emails are sent from the browser with EmailJS (or not at all, as a preview).

## Sessions

1. Open the site and create a session (title, optional note). Save the **admin link**: anyone with it can manage the session, and it can't be recovered. The browser also remembers it under "Sessions on this device".
2. Share the **join link**. People see the title and note, enter their details, and get a confirmation. Nobody sees anyone else's data.
3. On the admin page you can add or remove people. **Close session** (needs at least 2 participants) stops all joins and freezes the list.
4. Roll, optionally re-roll, and send. The session becomes **Completed** when every email is delivered. The pairing itself is never stored.
5. **Delete session** removes it and all its data at any time. Sessions are also deleted automatically 60 days after creation.

## Quick start

Needs Node 22.13 or newer.

```bash
npm install
cp .env.example .env    # then fill in the values you need (see below)
npm run dev             # http://localhost:5173
```

Want to try it first without EmailJS? Put `VITE_EMAILJS_DRY_RUN=true` in `.env`. The whole flow works, but no email is sent.

Without the two `VITE_SUPABASE_*` values the app still runs, but sessions are unavailable and only `/quick` works.

## Deploying (Cloudflare Workers + Supabase)

1. **Supabase**: create a project and apply the files in `supabase/migrations/` in order (SQL editor or `supabase db push`). Copy the Project URL and the publishable key (`sb_publishable_...`). Never use a secret or `service_role` key.
2. **Cloudflare**: connect the repository as a Worker with static assets. Build command `npm run build`, deploy command `npx wrangler deploy`. `wrangler.jsonc` pins the settings and runs the mail Worker (`worker/index.ts`) for `/api/*` only.
3. **Build variables** (Settings > Build, baked into the page): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `VITE_PUBLIC_URL` (the base address used in shared links). Do not set any `VITE_EMAILJS_*` value, and remove `VITE_EMAILJS_DRY_RUN` once you want real emails.
4. **Runtime variables and secrets** (Settings > Variables and Secrets, read only by the Worker): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, and the secret `EMAILJS_PRIVATE_KEY`. Preview deployments of other branches don't inherit them, so they can't send real email.
5. **EmailJS**: after a real test email works, turn on "Use Private Key" and "Allow EmailJS API for non-browser applications" in the account security settings. Browser-only sends with the public key are then rejected.

To run the Worker locally, copy `.dev.vars.example` to `.dev.vars`, fill it in, and run `npm run build && npx wrangler dev`.

Supabase free projects are paused after a week of low activity. Resume the project from the dashboard before sharing a link after a quiet period.

**Send limits** protect your EmailJS quota (200 requests per month on the free plan): each person can be emailed at most 6 times per session (retries included) and at most 100 emails are sent per day overall. Both are rows in `private.settings` (`send_per_participant`, `send_per_day`), along with the per-address limits for creating and joining sessions and the 60-day retention.

## Quick draw setup

### EmailJS setup (once)

1. Create a free account at <https://www.emailjs.com>.
2. Add an **Email Service** (connect the mailbox the emails should come from) and note its **Service ID**.
3. Create an **Email Template** ([dashboard](https://dashboard.emailjs.com/admin/templates)) and note its **Template ID**:
   - **To Email**: `{{to_email}}`
   - **Subject**: `Secret Santa`
   - **Content**: `<div style="white-space: pre-line">{{message}}</div>` (optionally `Hi {{to_name}},` above it). The `pre-line` style keeps the line breaks of lists in gift ideas. Without it, email clients run the lines together, which is still readable because list items start with a bullet.
   - Keep the double braces. They are HTML-escaped by EmailJS. Never use `{{{...}}}`, because names and gift ideas are typed in by people.
   - In the template settings, **turn off email history** (see the privacy notes below).
4. Copy your **Public Key** from the [account page](https://dashboard.emailjs.com/admin/account).
5. For the quick draw on your own machine, put the three values into `.env` and restart `npm run dev`. For sessions, put them in the Worker's runtime variables instead (see above) and add the Private Key there as a secret.

Only the Public Key may appear in `.env`. Everything starting with `VITE_` is bundled into the page, so never add your EmailJS Private Key there. On a public site, don't put the `VITE_EMAILJS_*` values in the build either: anyone could copy the key and send mail from your account. Without them, `/quick` is a preview that shows the draw but sends nothing.

The app sends these template variables: `to_email`, `to_name`, and `message`, for example:

> You were chosen to be Santa for Alice. Alice dreams of a red scarf.

The second sentence only appears when a gift idea was entered.

### Gift ideas and notes

The gift idea (up to 500 characters) and the session note can have several lines. The gift idea also has a small editor with these buttons (shortcuts Ctrl/Cmd+B, I and K):

- `**bold**`, `*italic*`
- lists: lines starting with `- ` or `1. `
- links: `[text](https://example.com)`, or just paste a web address

On the admin page they are shown formatted, and links open in a new tab. Only `http` and `https` links are made clickable, and HTML typed by people is always shown as plain text. In emails the formatting is turned into plain text: bold and italic marks are removed, links are written as `text (https://...)`, and lists become lines starting with a bullet.

## How it works

- **Distribution**: a uniformly random draw where everybody is Santa for exactly one other person, has exactly one Santa, and never gets themselves. Two people can end up gifting each other.
- **Show results to me checked**: the full list is shown (`Alice is Santa for Bob`). **Re-roll** as often as you like, then **Confirm and send emails**. A re-roll never repeats the previous result when a different one exists.
- **Unchecked**: the draw happens silently and the emails go out right away. The pairing is never shown on screen.
- **Limits**: 2 to 100 participants, unique names and unique emails. The free EmailJS plan allows 200 requests per month, and EmailJS accepts one request per second, so the app sends one email per second (20 people take about 25 seconds).
- **Failed emails**: the reason is shown next to the person. **Retry failed** re-sends only those emails with the same pairing. Keep the tab open until everything is delivered; the app warns before you leave while emails are pending. If you close the tab early, the pairing is lost, so a new roll is needed and earlier emails become outdated (the admin page warns about this).

## Privacy notes

**What is stored (sessions only):** title, note, and each participant's name, email and gift idea, in Supabase, for at most 60 days or until the session is deleted. Only the admin link can read the list. Pairings are never stored. Each email passes through the Cloudflare Worker and EmailJS on its way, and the Worker doesn't log messages.

**In your browser:** the admin link (with its secret token) is kept in `localStorage` under "Sessions on this device". Use "Forget" to remove it, and don't use shared computers for admin work. The token sits after the `#` in the link, so it is not sent to the server when the page loads or recorded in server logs. Participants' browsers store nothing.

**Silent mode:** the page never displays the pairing, but a few other places can:

1. **EmailJS email history** stores the variables of every request, which is the whole message. Turn it off in the template settings, otherwise whoever can open the EmailJS dashboard can read every pairing (free plan: kept for 7 days).
2. **The sending mailbox** keeps copies in its Sent folder. If the organizer must not know the pairing, send from a dedicated address the organizer never opens.
3. **Browser dev tools**: the draw runs in the organiser's browser, so the message is visible in the Network tab while sending.

The quick draw (`/quick`) stores nothing and writes nothing to `localStorage` or cookies; closing the tab discards the participant list.

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Dev server with hot reload (localhost only)     |
| `npm run build`     | Type-check and build to `dist/`                 |
| `npm run preview`   | Serve the production build locally              |
| `npm test`          | Unit, UI, Worker and database tests (no network, never sends real email) |
| `npm run typecheck` | Type-check only                                 |
