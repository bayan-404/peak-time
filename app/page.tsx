"use client";

import { useEffect, useState } from "react";
import Heatmap from "@/components/Heatmap";
import { DAYS, formatHour } from "@/lib/analyze";
import type { BestTimesResult, Channel } from "@/lib/types";

export default function Home() {
  // Demo by default so anyone can try it; "My Buffer" uses the server's API key.
  const [demo, setDemo] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [result, setResult] = useState<BestTimesResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    setResult(null);
    setChannels([]);
    setChannelId("");
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
    // Skip stale IDs left over from the other mode while channels reload.
    if (!channels.some((c) => c.id === channelId)) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const qs = new URLSearchParams({ channelId, tz, ...(demo ? { demo: "1" } : {}) });
    setResult(null);
    setError("");
    fetch(`/api/best-times?${qs}`)
      .then((r) => r.json())
      .then((data) => (data.error ? setError(data.error) : setResult(data)))
      .catch(() => setError("Could not load analytics"));
  }, [channelId, channels, demo]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">PeakTime</h1>
        <p className="opacity-70">Find your best time to post, from your own Buffer analytics.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border p-1 text-sm">
        {[
          { label: "Demo data", value: true },
          { label: "My Buffer", value: false },
        ].map((o) => (
          <button
            key={o.label}
            onClick={() => setDemo(o.value)}
            className={`rounded-md px-3 py-1.5 ${
              demo === o.value ? "bg-[var(--accent)] text-white" : "opacity-70 hover:opacity-100"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

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
      </div>

      {result && (
        <>
          <section className="rounded-xl border p-4 space-y-1">
            <p className="text-lg font-medium">{result.tip}</p>
            <p className="text-sm opacity-60">
              Based on {result.postCount} sent post{result.postCount === 1 ? "" : "s"} · ranked by{" "}
              {result.metric}
              {result.blockHours === 3 && " · grouped into 3-hour blocks (small sample)"}
            </p>
            {result.metricsUpdatedAt && (
              <p className="text-xs opacity-50">
                Buffer metrics updated {new Date(result.metricsUpdatedAt).toLocaleString()}
              </p>
            )}
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
