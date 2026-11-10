# Secret Santa

A small local Vue 3 + TypeScript site. Add participants (name, email, optional gift idea), roll the dice, and every participant gets an email saying who they are Santa for. There is no backend and nothing is stored; emails are sent from the browser through [EmailJS](https://www.emailjs.com).

## Quick start

Needs Node 22.13 or newer.

```bash
npm install
cp .env.example .env    # then fill in the three EmailJS values (see below)
npm run dev             # http://localhost:5173
```

Want to try it first without EmailJS? Put `VITE_EMAILJS_DRY_RUN=true` in `.env`. The whole flow works, but no email is sent.

## EmailJS setup (once)

1. Create a free account at <https://www.emailjs.com>.
2. Add an **Email Service** (connect the mailbox the emails should come from) and note its **Service ID**.
3. Create an **Email Template** ([dashboard](https://dashboard.emailjs.com/admin/templates)) and note its **Template ID**:
   - **To Email**: `{{to_email}}`
   - **Subject**: `Secret Santa`
   - **Content**: `{{message}}` (optionally `Hi {{to_name}},` above it)
   - Keep the double braces. They are HTML-escaped by EmailJS. Never use `{{{...}}}`, because names and gift ideas are typed in by people.
   - In the template settings, **turn off email history** (see the privacy notes below).
4. Copy your **Public Key** from the [account page](https://dashboard.emailjs.com/admin/account).
5. Put the three values into `.env` and restart `npm run dev`.

Only the Public Key belongs in `.env`. Everything starting with `VITE_` is bundled into the page, so never add your EmailJS Private Key there.

The app sends these template variables: `to_email`, `to_name`, and `message`, for example:

> You were chosen to be Santa for Alice. Alice dreams of a red scarf.

The second sentence only appears when a gift idea was entered.

## How it works

- **Distribution**: a uniformly random draw where everybody is Santa for exactly one other person, has exactly one Santa, and never gets themselves. Two people can end up gifting each other.
- **Show results to me checked**: the full list is shown (`Alice is Santa for Bob`). **Re-roll** as often as you like, then **Confirm and send emails**. A re-roll never repeats the previous result when a different one exists.
- **Unchecked**: the draw happens silently and the emails go out right away. The pairing is never shown on screen.
- **Limits**: 2 to 100 participants, unique names and unique emails. The free EmailJS plan allows 200 requests per month, and EmailJS accepts one request per second, so the app sends one email per second (20 people take about 25 seconds).
- **Failed emails**: the reason is shown next to the person. **Retry failed** re-sends only those emails with the same pairing. Keep the tab open until everything is delivered; the app warns before you leave while emails are pending.

## Privacy notes for silent mode

The page never displays the pairing in silent mode, but a few other places can:

1. **EmailJS email history** stores the variables of every request, which is the whole message. Turn it off in the template settings, otherwise whoever can open the EmailJS dashboard can read every pairing (free plan: kept for 7 days).
2. **The sending mailbox** keeps copies in its Sent folder. If the organizer must not know the pairing, send from a dedicated address the organizer never opens.
3. **Browser dev tools**: the emails are sent from the browser, so the pairing is visible in the Network tab while sending.

Nothing is written to `localStorage` or cookies, and closing the tab discards the participant list.

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Dev server with hot reload (localhost only)     |
| `npm run build`     | Type-check and build to `dist/`                 |
| `npm run preview`   | Serve the production build locally              |
| `npm test`          | Unit and UI tests (never sends real email)      |
| `npm run typecheck` | Type-check only                                 |
# secretSanta
