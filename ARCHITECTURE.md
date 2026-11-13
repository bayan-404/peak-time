# Streakline Architecture

> Plan a "Day N of X" posting series in one place and schedule every day to Buffer.

## 1. Scope

1. **Connect** a Buffer account (OAuth).
2. **Create a series**: number of days, start date, time, weekdays, channels, topic.
3. **Write** one note per day. The "Day N/X" wording is added automatically.
4. **Schedule** every remaining day to Buffer in one click.
5. **Move** a day to a later date. Later days follow, and posts already in Buffer are updated.

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Frontend + server API routes in one repo, one deploy |
| Styling | Tailwind CSS | Fast to build a clean UI |
| Auth | Buffer OAuth 2.0 (Authorization Code + PKCE) | Each user schedules to their own account |
| Session | Encrypted, HTTP-only cookie | No database needed to keep someone connected |
| Series data | Browser `localStorage` | No database, and the user's plan never leaves their device |
| Hosting | Vercel | Deploys from GitHub, handles env vars |

## 3. Data flow

```
Browser (app/series/…)
   │  series saved in localStorage (lib/series-store.ts)
   │  dates and post text computed in the browser (lib/series.ts)
   │
   │  GET  /api/auth/me            connected?
   │  GET  /api/channels           channel picker
   │  POST /api/series/schedule    create posts, 10 per request
   │  POST /api/series/reconcile   which of these already exist in Buffer?
   │  POST /api/series/move        change the time of scheduled posts
   ▼
Next.js API routes (server only: client secret + decrypted tokens)
   │  lib/oauth.ts    → token exchange and refresh
   │  lib/session.ts  → encrypted cookie
   │  lib/buffer.ts   → GraphQL calls to Buffer
   ▼
Buffer API: POST https://api.buffer.com (GraphQL)
```

**Rule:** the client secret and the user's tokens never reach browser code. The browser only carries the token inside a cookie it cannot read.

**Why dates are computed in the browser:** a series posts at "9:00 in my timezone". Building the dates where that timezone lives keeps them right across daylight-saving changes. The server only receives finished ISO timestamps.

## 4. Files

```
app/page.tsx                        Redirects to /series
app/series/page.tsx                 Series list + "New series" form (or the welcome screen)
app/series/[id]/page.tsx            One series: notes, schedule, move a day
app/privacy/page.tsx                Privacy policy
app/api/auth/{login,callback,logout,me}/route.ts   OAuth flow + connection check
app/api/channels/route.ts           GET  → Channel[]
app/api/series/schedule/route.ts    POST → create scheduled posts
app/api/series/reconcile/route.ts   POST → find posts with an unknown outcome
app/api/series/move/route.ts        POST → move scheduled posts
components/Welcome.tsx              First screen before Buffer is connected
components/Logo.tsx, ServiceIcon.tsx
lib/series.ts                       Series model + pure logic, no I/O
lib/series-store.ts                 localStorage read/write
lib/buffer.ts                       Buffer GraphQL client (server-only)
lib/oauth.ts                        OAuth + token refresh (server-only)
lib/session.ts                      Encrypted cookie (server-only)
lib/api-error.ts                    Safe error responses
lib/types.ts                        Shared `Channel` type
```

`lib/buffer.ts` maps Buffer's raw responses into our own shapes, so if Buffer's field names change, only one file changes.

## 5. Series logic (`lib/series.ts`)

- **Day numbers map to posting slots, not dates.** Slots only fall on the chosen weekdays. That is why a "Mon/Wed/Fri" series stays on those days after a day is moved.
- **Moving a day adds a skip.** A skip pushes that day and every later day back one slot. No day is dropped and the order never changes.
- **`schedulePlan` is idempotent.** It lists only the days not yet in Buffer, so "Schedule all" can be clicked again to continue or retry.
- **`movePlan` is idempotent too.** It lists posts whose time in Buffer no longer matches the plan. A post drops off once it is moved.
- **Notes lock once a day is scheduled**, because edits made here would not reach the post in Buffer.

## 6. Buffer API usage

| Operation | Purpose |
|---|---|
| `account → organizations { id }` | Get `organizationId` |
| `channels(input: { organizationId })` | Fill the channel picker |
| `createPost` (mode `customScheduled`, `dueAt`) | Schedule one day on one channel |
| `editPost` | Move a scheduled post to a new time |
| `posts(… filter: { status: [scheduled], channelIds, dueAt })` | Check what already exists |

Scopes: `account:read`, `posts:write`, `posts:read`, `offline_access`.

GraphQL returns HTTP 200 even on errors, so `bufferRequest()` checks the `errors` array. Mutation failures come back as a union member (`MutationError`), not in `errors`.

**Constraints and how we handle them:**

- **Rate limit:** 100 requests / 15 min + 10 per authorized user, shared by all users of the app. Scheduling reads the `RateLimit` header and stops when a window is nearly empty; on a `429` it reports `Retry-After`. The series is resumable, so the user clicks again later.
- **No idempotency key on `createPost`.** A batch is marked `pending` before it is sent. If no answer comes back, the next run asks Buffer what exists (`/api/series/reconcile`) before creating anything. This is what prevents double posts.
- **Plan limits** (for example 10 scheduled posts per channel on the free plan) are reported as "plan is full", not as failed days. The rest are scheduled in a later round.
- **Refresh tokens are single-use.** Reusing one revokes the whole grant, so all refreshes go through `getAccessToken()`, which de-duplicates concurrent refreshes. The client also sends batches one at a time.
- **`editPost` needs the text again**, or Buffer rejects it with "Post must have either text or media".

## 7. Status

- [x] OAuth connect / disconnect
- [x] Create a series with chosen weekdays
- [x] Schedule all, resumable, safe against double posts
- [x] Move a day and update Buffer
- [x] Privacy policy
- [ ] README screenshots
- [ ] Sync series across devices (needs a server store)
