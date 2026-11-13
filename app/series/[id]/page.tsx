"use client";

// One series: write a note per day, then schedule every remaining day to Buffer.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CHECK_IN_TEXT, dayKey, dueAtFor, formatWait, renderDay, schedulePlan, type Series } from "@/lib/series";
import { getSeries, saveSeries } from "@/lib/series-store";
import type { Channel } from "@/lib/types";

const BATCH = 10; // must match the API's MAX_BATCH
type Result = { key: string; postId?: string; dueAt?: string; error?: string; unknown?: boolean };

const UNKNOWN_OUTCOME =
  "Lost the connection before Buffer answered. Click the button again: it checks what reached Buffer first, so nothing is posted twice.";
const rateLimitMessage = (seconds: number) =>
  `Buffer's rate limit is reached. Everything scheduled so far is saved. Click the button again in about ${formatWait(seconds)}.`;

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSeries(getSeries(id));
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setChannels(d));
  }, [id]);

  const plan = useMemo(() => (series ? schedulePlan(series) : null), [series]);
  const channelName = (cid: string) => channels.find((c) => c.id === cid)?.name ?? "channel";

  function update(next: Series) {
    setSeries(next);
    saveSeries(next);
  }

  function setNote(day: number, note: string) {
    if (!series) return;
    update({ ...series, notes: { ...series.notes, [day]: note } });
  }

  async function scheduleAll() {
    if (!series || !plan || plan.items.length === 0) return;
    setError("");
    setFailures({});
    setProgress({ done: 0, total: plan.items.length });
    try {
      await runSchedule(series);
    } catch {
      // The request itself failed, so we don't know what Buffer received.
      setError(UNKNOWN_OUTCOME);
    } finally {
      setProgress(null);
    }
  }

  async function runSchedule(start: Series) {
    // Refresh the token once up front, so batches never race a refresh.
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (!me.connected) return setError("Your Buffer connection expired. Reconnect on the series list.");

    let cur = start;

    // An earlier run ended without an answer for these posts. Ask Buffer which
    // ones exist before creating anything, or they would be posted twice.
    if (cur.pending?.length) {
      const unsure = schedulePlan(cur).items.filter((it) => cur.pending!.includes(it.key));
      const posts = { ...cur.posts };
      if (unsure.length > 0) {
        const res = await fetch("/api/series/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: unsure.map(({ key, channelId, dueAt }) => ({ key, channelId, dueAt })) }),
        });
        const data = (await res.json().catch(() => ({}))) as { found?: Result[]; error?: string; retryAfter?: number };
        if (!data.found) {
          return setError(
            data.retryAfter ? rateLimitMessage(data.retryAfter) : (data.error ?? "Could not check Buffer. Try again."),
          );
        }
        for (const r of data.found) posts[r.key] = { postId: r.postId!, dueAt: r.dueAt! };
      }
      cur = { ...cur, posts, pending: undefined };
      update(cur);
    }

    const items = schedulePlan(cur).items;
    setProgress({ done: 0, total: items.length });
    const failed: Record<string, string> = {};
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      // Mark the batch as in flight first: if the tab closes or the network
      // drops before the answer arrives, the next run knows to check Buffer.
      cur = { ...cur, pending: batch.map((b) => b.key) };
      update(cur);

      const res = await fetch("/api/series/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch.map(({ key, channelId, text, dueAt }) => ({ key, channelId, text, dueAt })) }),
      });
      const data = (await res.json().catch(() => null)) as {
        results?: Result[];
        retryAfter?: number | null;
        error?: string;
      } | null;
      if (!data?.results) {
        // A 4xx with a message was refused before anything reached Buffer.
        if (res.status < 500 && data?.error) {
          update({ ...cur, pending: undefined });
          return setError(data.error);
        }
        return setError(UNKNOWN_OUTCOME);
      }

      const posts = { ...cur.posts };
      const unknown: string[] = [];
      for (const r of data.results) {
        if (r.postId) posts[r.key] = { postId: r.postId, dueAt: r.dueAt! };
        else if (r.unknown) unknown.push(r.key);
        else failed[r.key] = r.error ?? "Failed";
      }
      // Save after every batch so a closed tab never loses what Buffer already has.
      cur = { ...cur, posts, pending: unknown.length > 0 ? unknown : undefined };
      update(cur);
      setFailures({ ...failed });
      setProgress({ done: Math.min(i + data.results.length, items.length), total: items.length });

      if (unknown.length > 0) return setError(UNKNOWN_OUTCOME);

      // Out of quota with posts still to go: stop and say when to come back.
      if (data.retryAfter != null && i + data.results.length < items.length) {
        return setError(rateLimitMessage(data.retryAfter));
      }

      // A whole batch failing usually means a plan limit or bad token: stop, don't hammer.
      if (data.results.length > 0 && data.results.every((r) => r.error)) {
        return setError(`Stopped: ${data.results[0].error}`);
      }
    }
  }

  if (series === undefined) return null;
  if (series === null)
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <p>Series not found on this device.</p>
        <Link href="/series" className="underline">Back to series</Link>
      </main>
    );

  const failCount = Object.keys(failures).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <header className="space-y-1">
        <Link href="/series" className="text-sm opacity-60 hover:opacity-100">← All series</Link>
        <h1 className="text-3xl font-bold">{series.name}</h1>
        <p className="text-sm opacity-70">
          {series.total} days from {series.startDate} at {series.time} ({series.timezone}) ·{" "}
          {series.channelIds.map(channelName).join(", ")}
        </p>
      </header>

      <section className="sticky top-0 z-10 rounded-xl border bg-[var(--background)] p-4 space-y-2">
        {plan && (
          <p className="text-sm">
            <b>{plan.done}</b> scheduled · <b>{plan.items.length}</b> to schedule
            {plan.past > 0 && <> · {plan.past} past (skipped)</>}
          </p>
        )}
        <button
          onClick={scheduleAll}
          disabled={!!progress || !plan || plan.items.length === 0}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
        >
          {progress
            ? `Scheduling ${progress.done}/${progress.total}…`
            : failCount > 0 || error
              ? `Retry ${plan?.items.length} remaining`
              : `Schedule all ${plan?.items.length ?? 0} posts`}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {failCount > 0 && !error && <p className="text-sm text-red-600">{failCount} failed. See the days below.</p>}
      </section>

      <ol className="space-y-3">
        {Array.from({ length: series.total }, (_, i) => i + 1).map((n) => {
          const due = dueAtFor(series, n);
          const keys = series.channelIds.map((c) => dayKey(n, c));
          const locked = keys.some((k) => series.posts[k]); // already in Buffer: edits wouldn't sync
          return (
            <li key={n} className="rounded-xl border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  Day {n} <span className="opacity-60">· {due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {series.channelIds.map((c) => {
                    const k = dayKey(n, c);
                    const [label, cls] = series.posts[k]
                      ? ["scheduled", "bg-green-600/15 text-green-700"]
                      : failures[k]
                        ? ["failed", "bg-red-600/15 text-red-700"]
                        : due.getTime() <= Date.now()
                          ? ["past", "opacity-50"]
                          : ["not scheduled", "opacity-60"];
                    return (
                      <span key={c} title={failures[k]} className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>
                        {channelName(c)}: {label}
                      </span>
                    );
                  })}
                </span>
              </div>
              <textarea
                value={series.notes[n] ?? ""}
                onChange={(e) => setNote(n, e.target.value)}
                disabled={locked}
                rows={2}
                placeholder={CHECK_IN_TEXT}
                className="w-full rounded-md border px-3 py-2 bg-transparent text-sm disabled:opacity-60"
              />
              <p className="text-xs opacity-60 whitespace-pre-wrap">{renderDay(series.template, n, series.total, series.notes[n])}</p>
              {keys.map((k) => failures[k] && <p key={k} className="text-xs text-red-600">{failures[k]}</p>)}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
