# PeakTime Architecture

> Shows creators **when** their audience engages most, using their own Buffer post analytics.

## 1. MVP scope

1. Pick a **channel** (Instagram, LinkedIn, X…).
2. Pull **sent posts + per-post metrics** from Buffer.
3. Show a **7×24 heatmap** (weekday × hour) of average engagement.
4. Highlight the **top 3 time slots** with one plain-English tip.
5. **Demo mode** with sample data, so anyone can try it without an account.

Nice-to-have: "Schedule my next post at the best slot" (`createPost` mutation).

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Frontend + server API routes in one repo, one deploy |
| Styling | Tailwind CSS | Fast to build a clean UI |
| Heatmap | Plain CSS grid | It's just colored cells; no chart library needed |
| Hosting | Vercel | Free, deploys from GitHub, handles env vars |
| Data | No database | Fetch live from Buffer, cache in memory |

## 3. Data flow

```
Browser (app/page.tsx)
   │  GET /api/channels
   │  GET /api/best-times?channelId=...&tz=...
   ▼
Next.js API routes (server only, holds BUFFER_API_KEY)
   │  lib/buffer.ts   → GraphQL calls to Buffer
   │  lib/analyze.ts  → pure function: posts → heatmap + top slots
   ▼
Buffer API: POST https://api.buffer.com (GraphQL)
```

**Rule:** the API key never reaches the browser. Anything in frontend code is public.

## 4. Files

```
app/page.tsx                  UI: channel picker, tip, top slots, heatmap
app/api/channels/route.ts     GET → Channel[]
app/api/best-times/route.ts   GET → BestTimesResult
components/Heatmap.tsx        7 × 24 grid
lib/buffer.ts                 Buffer GraphQL client (server-only)
lib/analyze.ts                Core logic, no I/O
lib/demo-data.ts              Seeded fake posts for demo mode
lib/types.ts                  Shared types
```

`lib/buffer.ts` maps Buffer's raw response into our own `PostSample` type, so if Buffer's field names change, only one file changes.

## 5. Buffer API usage

| Step | Operation | Purpose |
|---|---|---|
| 1 | `account → organizations { id }` | Get `organizationId` |
| 2 | `channels(input: { organizationId })` | Fill the channel picker |
| 3 | `posts(first, after, input: { organizationId, filter: { status: [sent], channelIds } })` → `sentAt`, `metrics { type value }`, `metricsUpdatedAt` | Raw data (100/page, max 10 pages) |
| 4 (optional) | `createPost` mutation | Schedule at peak time |

GraphQL returns HTTP 200 even on errors, so `bufferQuery()` checks the `errors` array.

Metric names differ per network, so `toSample()` normalizes them: `reactions|likes`, `comments`, `shares|reposts`, `impressions|views|reach`.

**Constraints:**
- Metrics refresh **daily**, so data can lag ~24h. Show "last updated".
- Free plans: analytics limited to the **last 31 days**, so expect small samples.
- Rate limit is shared across all calls. Cache results ~10 min.
- Metrics vary by network. Reactions + comments are always present; impressions only on some.

## 6. Analysis rules (`lib/analyze.ts`)

- **Use the user's timezone, not UTC**, or "best at 3am" is really 9pm local.
- **Use engagement rate** (engagements ÷ impressions) when every post has impressions, so wider-reaching posts don't win unfairly. Otherwise use raw engagements.
- **Need ≥ 2 posts in a slot** to rank it, so one viral post can't crown a slot.
- **Fewer than 15 posts → 3-hour blocks**, so the heatmap isn't mostly empty.

## 7. Status

- [x] Scaffold, analysis logic, demo mode, heatmap UI
- [x] Live Buffer data (`account`, `channels`, `posts` with `metrics`)
- [x] Demo / My Buffer toggle + error/empty states
- [x] 10-min in-memory cache (`lib/cache.ts`)
- [ ] Deploy to Vercel + README screenshots
