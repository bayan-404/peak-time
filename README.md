# Streakline

Plan a whole "Day 1 of 30" posting challenge up front, and let [Buffer](https://buffer.com) publish it for you.

## The problem

A posting challenge ("30 days of building my app") is easy to start and hard to keep going:

- **Planning is scattered.** Ideas live in notes, dates live in a calendar, posts live in Buffer.
- **Scheduling is repetitive.** Thirty posts means thirty rounds of typing "Day N/30", picking a date, and picking a time.
- **One missed day breaks the series.** The numbering is off, and fixing it means editing every post after it by hand.

Streakline gives you **one simple place to plan the posts and manage the content**: every day of the series on one page, scheduled in one click, and easy to shift when life gets in the way.

## User story

> As a creator running a "Day N of X" challenge,
> I want to write all my posts in one place and schedule them at once,
> so that I show up every day without opening a scheduler every day.

A typical run:

1. Sam connects their Buffer account.
2. Sam sets up "30 days of coding my app": 30 days, weekdays at 9:00, starting Monday, on LinkedIn and X.
3. Sam writes a short note for each day and clicks **Schedule all**.
4. In week two Sam is travelling on Thursday, so they move that day to Friday. Every later day follows, and the posts already in Buffer are updated.

## Features

**Plan**

- Set the number of days (up to 365), start date, post time, and channels.
- Pick how often: every day, a few times a week, or the exact weekdays you want.
- See the dates of the first and last post before you create anything.

**Write**

- One note per day, all on one page.
- Numbering is automatic: your note becomes "Day 4/30 of coding my app: …".
- A live preview shows each post exactly as it will be published.
- No note for a day? It goes out as a short check-in, so the streak holds.

**Schedule**

- One click sends every remaining day to Buffer, to one or several channels.
- Safe to interrupt and retry: nothing is posted twice.
- If Buffer's rate limit or your plan's limit is reached, it stops, tells you why, and continues from where it left off.

**Manage**

- Each day shows its status per channel: not scheduled, scheduled, posted, or missed.
- Can't show up one day? Move it to a later date. The days after it shift in the same order, so no day is dropped.
- Keep several series side by side, and delete the ones you are done with.

**Private by design**

- No database. Your series are saved in your own browser.
- Your Buffer token sits in an encrypted, HTTP-only cookie.
- Nothing is posted without your click. See [PRIVACY.md](PRIVACY.md).

## Good to know

- Editing or deleting a post that is already scheduled happens in Buffer.
- A series lives in the browser it was created in. It does not sync across devices.
- Buffer's free plan limits how many posts can be scheduled per channel, so a long series is scheduled in rounds.

## Run it locally

You need Node.js 20+ and a [Buffer OAuth app](https://developers.buffer.com).

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | What it is |
|---|---|
| `BUFFER_CLIENT_ID`, `BUFFER_CLIENT_SECRET` | From your Buffer OAuth app |
| `BUFFER_REDIRECT_URI` | Must match the redirect URI on the Buffer app exactly |
| `SESSION_SECRET` | 32+ characters. Generate one with `openssl rand -base64 32` |

Buffer only redirects to `https`, so run the dev server over HTTPS. This needs a local certificate at `certificates/localhost.pem` and `certificates/localhost-key.pem` (for example from [mkcert](https://github.com/FiloSottile/mkcert)).

```bash
npm run dev:https
```

Open https://localhost:3000.

## Tech stack

Next.js (App Router), TypeScript, Tailwind CSS, and the Buffer GraphQL API. No database.

For how the pieces fit together, see [ARCHITECTURE.md](ARCHITECTURE.md).
