"use client";

import { useEffect, useState } from "react";
import Heatmap from "@/components/Heatmap";
import { DAYS, formatHour } from "@/lib/analyze";
import type { BestTimesResult, Channel } from "@/lib/types";

export default function Home() {
  // Demo mode is the only mode until live Buffer data is wired up.
  const demo = true;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [result, setResult] = useState<BestTimesResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/channels${demo ? "?demo=1" : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) return setError(data.error);
        setChannels(data);
        setChannelId(data[0]?.id ?? "");
      })
      .catch(() => setError("Could not load channels"));
  }, [demo]);

  useEffect(() => {
    if (!channelId) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const qs = new URLSearchParams({ channelId, tz, ...(demo ? { demo: "1" } : {}) });
    setResult(null);
    fetch(`/api/best-times?${qs}`)
      .then((r) => r.json())
      .then((data) => (data.error ? setError(data.error) : setResult(data)))
      .catch(() => setError("Could not load analytics"));
  }, [channelId, demo]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">PeakTime</h1>
        <p className="opacity-70">Find your best time to post, from your own Buffer analytics.</p>
        {demo && (
          <span className="inline-block text-xs rounded-full px-2 py-0.5 bg-[var(--accent)]/15">
            Demo data
          </span>
        )}
      </header>

      {error && <p className="text-red-600">{error}</p>}

      {channels.length > 0 && (
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="rounded-md border px-3 py-2 bg-transparent"
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.service})
            </option>
          ))}
        </select>
      )}

      {result && (
        <>
          <section className="rounded-xl border p-4 space-y-1">
            <p className="text-lg font-medium">{result.tip}</p>
            <p className="text-sm opacity-60">
              Based on {result.postCount} sent posts · ranked by {result.metric}
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {result.topSlots.map((s, i) => (
              <div key={`${s.day}-${s.hour}`} className="rounded-xl border p-4">
                <div className="text-xs opacity-60">#{i + 1}</div>
                <div className="text-xl font-semibold">
                  {DAYS[s.day]} {formatHour(s.hour)}
                </div>
                <div className="text-xs opacity-60">{s.posts} posts</div>
              </div>
            ))}
          </section>

          <Heatmap heatmap={result.heatmap} counts={result.counts} blockHours={result.blockHours} />
        </>
      )}
    </main>
  );
}
