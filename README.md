# PeakTime

Find your best time to post, from your own Buffer post analytics.

PeakTime reads your sent posts and their metrics from the [Buffer API](https://developers.buffer.com), then shows a weekday × hour heatmap and your top 3 time slots.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then paste your Buffer API key into .env.local
npm run dev
```

Open http://localhost:3000. Demo mode works without a key.

## How it works

See [ARCHITECTURE.md](ARCHITECTURE.md).
