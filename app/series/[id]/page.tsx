"use client";

// One series: write a note per day, then schedule every remaining day to Buffer.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ServiceIcon from "@/components/ServiceIcon";
import { autoSummary, runSchedule } from "@/lib/schedule-run";
import {
  CHECK_IN_TEXT,
  autoDue,
  dateFormatHint,
  dayKey,
  daysUntil,
  dueAtFor,
  formatDate,
  formatTime,
  formatWait,
  movePlan,
  renderDay,
  schedulePlan,
  skipDay,
  toDateInput,
  type MoveItem,
  type Series,
} from "@/lib/series";
import { getSeries, saveSeries } from "@/lib/series-store";
import type { Channel } from "@/lib/types";

const BATCH = 10; // must match the API's MAX_BATCH
type Progress = { done: number; total: number; label: "Scheduling" | "Moving" };

// Where the user reviews, edits or deletes what we scheduled.
const BUFFER_URL = "https://publish.buffer.com";

const UNKNOWN_OUTCOME =
  "Lost the connection before Buffer answered. Click the button again: it checks what reached Buffer first, so nothing is posted twice.";
// Moving a post twice to the same time changes nothing, so retrying is always safe.
const MOVE_INTERRUPTED = "Could not finish moving the posts. Click the button again to move the rest.";
const moveRateLimitMessage = (seconds: number) =>
  `Buffer's rate limit is reached. Posts moved so far are saved. Click the button again in about ${formatWait(seconds)}.`;
const rateLimitMessage = (seconds: number) =>
  `Buffer's rate limit is reached. Everything scheduled so far is saved. Click the button again in about ${formatWait(seconds)}.`;

export default function SeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  // Buffer's own words when the plan has no room for more scheduled posts.
  const [limit, setLimit] = useState("");
  // What the automatic top-up did when the page opened.
  const [autoNote, setAutoNote] = useState("");
  const autoTried = useRef(false);
  // Which day's "move to another date" picker is open, and the date chosen in it.
  const [moving, setMoving] = useState<{ day: number; date: string } | null>(null);

  useEffect(() => {
    setSeries(getSeries(id));
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setChannels(d));
  }, [id]);

  const plan = useMemo(() => (series ? schedulePlan(series) : null), [series]);
  // Posts in Buffer that still sit on their old date after a skip.
  const moves = useMemo(() => (series ? movePlan(series) : []), [series]);
  const channelName = (cid: string) => channels.find((c) => c.id === cid)?.name ?? "channel";
  const channelService = (cid: string) => channels.find((c) => c.id === cid)?.service;

  function update(next: Series) {
    setSeries(next);
    saveSeries(next);
  }

  function setNote(day: number, note: string) {
    if (!series) return;
    update({ ...series, notes: { ...series.notes, [day]: note } });
  }

  /** `auto`: started by the auto top-up on page open, not by a click. */
  async function scheduleAll(auto = false) {
    if (!series || progress) return;
    const total = schedulePlan(series).items.length;
    if (total === 0) return;
    setError("");
    setLimit("");
    setAutoNote("");
    setFailures({});
    setProgress({ done: 0, total, label: "Scheduling" });
    const { outcome, added, series: after } = await runSchedule(auto ? { ...series, autoAt: Date.now() } : series, {
      save: update,
      progress: (done, all) => setProgress({ done, total: all, label: "Scheduling" }),
      failures: setFailures,
    });
    setProgress(null);
    if (auto) setAutoNote(autoSummary(outcome, added, schedulePlan(after).items.length));

    switch (outcome.status) {
      case "limit":
        // On an automatic run the note above already says the queue is full.
        return auto ? undefined : setLimit(outcome.message);
      case "rate":
        return auto ? undefined : setError(rateLimitMessage(outcome.retryAfter));
      case "unknown":
        return setError(UNKNOWN_OUTCOME);
      case "disconnected":
        return setError("Your Buffer connection expired. Reconnect on the series list.");
      case "busy":
        return auto ? undefined : setError("This series is being scheduled in another tab. Try again in a minute.");
      case "stopped":
        return setError(outcome.message.startsWith("Could not") ? outcome.message : `Stopped: ${outcome.message}`);
    }
  }

  // Auto top-up: once per page open, if it is switched on and a slot may be free.
  useEffect(() => {
    if (!series || autoTried.current) return;
    autoTried.current = true;
    if (autoDue(series)) scheduleAll(true);
    // Runs once when the series has loaded; scheduleAll reads the same series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  function setAuto(on: boolean) {
    if (!series) return;
    // Turning it on right after Buffer said "full": no need to ask again now.
    update({ ...series, auto: on, autoAt: on ? Date.now() : undefined });
    if (!on) setAutoNote("");
  }

  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  /** "I won't show up that day": move this day to a later date. Later days follow by the same amount. */
  async function moveDay(day: number, date: string) {
    if (!series || progress) return;
    const from = dueAtFor(series, day);
    const days = daysUntil(from, date);
    if (!(days >= 1)) return;
    const inBuffer = Object.keys(series.posts).filter((k) => Number(k.split(":")[0]) >= day).length;
    const later = series.total > day ? ` Every day after it moves ${days} day${days === 1 ? "" : "s"} later too, so no day is dropped.` : "";
    const ok = confirm(
      `Move Day ${day} from ${formatDate(from)} to ${formatDate(addDays(from, days))}?${later}` +
        (inBuffer > 0 ? `\n\n${inBuffer} post${inBuffer === 1 ? "" : "s"} already in Buffer will be updated.` : ""),
    );
    if (!ok) return;
    setMoving(null);
    // Save the new plan first. If updating Buffer is interrupted, the posts
    // still on their old date show up in `moves` and can be finished later.
    const next = skipDay(series, day, days);
    update(next);
    await moveAll(next);
  }

  async function moveAll(start: Series) {
    const items = movePlan(start);
    if (items.length === 0) return;
    setError("");
    setFailures({});
    setProgress({ done: 0, total: items.length, label: "Moving" });
    try {
      await runMoves(start, items);
    } catch {
      setError(MOVE_INTERRUPTED);
    } finally {
      setProgress(null);
    }
  }

  async function runMoves(start: Series, items: MoveItem[]) {
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (!me.connected) return setError("Your Buffer connection expired. Reconnect on the series list.");

    let cur = start;
    const failed: Record<string, string> = {};
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const res = await fetch("/api/series/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch }),
      });
      const data = (await res.json().catch(() => null)) as {
        results?: { key: string; dueAt?: string; error?: string }[];
        retryAfter?: number | null;
        error?: string;
      } | null;
      if (!data?.results) return setError(data?.error ?? MOVE_INTERRUPTED);

      // Trust the time Buffer reports back, not the one we asked for.
      const posts = { ...cur.posts };
      for (const r of data.results) {
        if (r.dueAt) posts[r.key] = { ...posts[r.key], dueAt: r.dueAt };
        else failed[r.key] = r.error ?? "Failed";
      }
      cur = { ...cur, posts };
      update(cur);
      setFailures({ ...failed });
      setProgress({ done: Math.min(i + data.results.length, items.length), total: items.length, label: "Moving" });

      if (data.retryAfter != null && i + data.results.length < items.length) {
        return setError(moveRateLimitMessage(data.retryAfter));
      }
      const firstError = data.results.find((r) => r.error)?.error;
      // The route stops a batch early when it loses Buffer; a fully failed batch means stop too.
      if (data.results.length < batch.length || (firstError && data.results.every((r) => r.error))) {
        return setError(firstError ? `Stopped: ${firstError}` : MOVE_INTERRUPTED);
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
  // Nothing left to schedule and at least one post is in Buffer.
  const allDone = !!plan && plan.items.length === 0 && plan.done > 0 && !progress && moves.length === 0;
  const now = Date.now();
  const skipCount = series.skips?.length ?? 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <header className="space-y-1">
        <Link href="/series" className="text-sm opacity-60 hover:opacity-100">← All series</Link>
        <h1 className="text-3xl font-bold">{series.name}</h1>
        <p className="text-sm opacity-70">
          {series.total} days · {formatDate(dueAtFor(series, 1))}
          {series.total > 1 && <> → {formatDate(dueAtFor(series, series.total))}</>} · daily at{" "}
          {formatTime(dueAtFor(series, 1))} ({series.timezone})
          {series.channelIds.map((c) => (
            <span key={c} className="whitespace-nowrap">
              {" "}
              · <ServiceIcon service={channelService(c)} className="h-3.5 w-3.5 align-[-2px]" /> {channelName(c)}
            </span>
          ))}
          {skipCount > 0 && <> · pushed back {skipCount} day{skipCount === 1 ? "" : "s"}</>}
        </p>
      </header>

      <section className="sticky top-0 z-10 rounded-xl border bg-[var(--background)] p-4 space-y-2">
        {moves.length > 0 && !progress && (
          // Only shown when updating Buffer after a date change did not finish.
          <p className="text-sm">
            You changed the dates, but {moves.length} post{moves.length === 1 ? " is" : "s are"} still on the old date in
            Buffer.
          </p>
        )}
        {plan && (
          <p className="text-sm">
            <b>{plan.done}</b> scheduled · <b>{plan.items.length}</b> to schedule
            {plan.past > 0 && <> · {plan.past} past (skipped)</>}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {moves.length > 0 ? (
            // A skip changed the dates but some posts in Buffer are still on the old ones.
            <button
              onClick={() => moveAll(series)}
              disabled={!!progress}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
            >
              {progress
                ? `${progress.label} ${progress.done}/${progress.total}…`
                : `Finish updating ${moves.length} post${moves.length === 1 ? "" : "s"} in Buffer`}
            </button>
          ) : allDone ? (
            // Done: the next useful step is checking the queue in Buffer.
            <a
              href={BUFFER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-white"
            >
              All set. Open Buffer ↗
            </a>
          ) : (
            <button
              onClick={() => scheduleAll()}
              disabled={!!progress || !plan || plan.items.length === 0}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
            >
              {progress
                ? `${progress.label} ${progress.done}/${progress.total}…`
                : limit
                  ? `Schedule the next ${plan?.items.length} posts`
                  : failCount > 0 || error
                    ? `Retry ${plan?.items.length} remaining`
                    : `Schedule all ${plan?.items.length ?? 0} posts`}
            </button>
          )}
          {!allDone && !!plan && plan.done > 0 && (
            <a href={BUFFER_URL} target="_blank" rel="noopener noreferrer" className="text-sm underline opacity-70">
              Open Buffer ↗
            </a>
          )}
        </div>
        {limit && plan && (
          <div className="rounded-md bg-amber-500/15 px-3 py-2 text-sm space-y-1">
            <p className="font-medium">Your Buffer plan is full for now.</p>
            <p>
              Buffer says: “{limit}” {plan.done > 0 && <>The first {plan.done} are scheduled. </>}
              Space frees up as posts go out. To schedule them all at once, upgrade your Buffer plan or delete other
              scheduled posts in Buffer.
            </p>
            {series.auto ? (
              <p>Auto top-up is on, so the next days are added for you each time you open Streakline.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button onClick={() => setAuto(true)} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-white">
                  Do it automatically
                </button>
                <span className="opacity-80">
                  Each time you open Streakline, it schedules the next days as soon as Buffer has room.
                </span>
              </div>
            )}
          </div>
        )}
        {series.auto && (
          <p className="text-sm">
            <span className="rounded-full bg-green-600/15 px-2 py-0.5 text-xs font-medium text-green-700">
              Auto top-up on
            </span>{" "}
            {autoNote || (plan && plan.items.length > 0 ? "The next days are added when you open Streakline and Buffer has room." : "")}{" "}
            <button onClick={() => setAuto(false)} className="underline opacity-70 hover:opacity-100">
              Turn off
            </button>
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {failCount > 0 && !error && <p className="text-sm text-red-600">{failCount} failed. See the days below.</p>}
      </section>

      <ol className="space-y-3">
        {Array.from({ length: series.total }, (_, i) => i + 1).map((n) => {
          const due = dueAtFor(series, n);
          const keys = series.channelIds.map((c) => dayKey(n, c));
          const locked = keys.some((k) => series.posts[k]); // already in Buffer: edits wouldn't sync
          // Once the post time has passed the day is closed: nothing on the card can change it.
          const past = due.getTime() <= now;
          const done = past && locked; // it was in Buffer when its time came
          const cardColor = done
            ? "border-green-600/40 bg-green-600/10"
            : past
              ? "border-dashed bg-[var(--foreground)]/5"
              : "";
          const newDays = moving?.day === n ? daysUntil(due, moving.date) : NaN;
          return (
            <li key={n} className={`rounded-xl border p-3 space-y-2 ${cardColor}`}>
              {/* Three columns so the status badge sits in the top middle. */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-sm">
                <div>
                  <div className="font-medium">Day {n}</div>
                  <div className="text-xs opacity-70">
                    {formatDate(due)} · {formatTime(due)}
                  </div>
                </div>
                <div className="pt-0.5">
                  {done && (
                    <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-semibold text-white">✓ Done</span>
                  )}
                  {past && !done && (
                    <span className="rounded-full border px-3 py-1 text-xs font-semibold opacity-70">Missed</span>
                  )}
                </div>
                <span className="flex flex-wrap justify-end gap-1">
                  {series.channelIds.map((c) => {
                    const k = dayKey(n, c);
                    const [label, cls] = series.posts[k]
                      ? [past ? "posted" : "scheduled", "bg-green-600/15 text-green-700"]
                      : failures[k]
                        ? ["failed", "bg-red-600/15 text-red-700"]
                        : past
                          ? ["not posted", "opacity-60"]
                          : ["not scheduled", "opacity-60"];
                    return (
                      <span
                        key={c}
                        title={failures[k]}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${cls}`}
                      >
                        <ServiceIcon service={channelService(c)} className="h-3 w-3" />
                        {channelName(c)}: {label}
                      </span>
                    );
                  })}
                </span>
              </div>
              <textarea
                value={series.notes[n] ?? ""}
                onChange={(e) => setNote(n, e.target.value)}
                disabled={locked || past}
                rows={2}
                placeholder={CHECK_IN_TEXT}
                className="w-full rounded-md border px-3 py-2 bg-transparent text-sm disabled:opacity-60"
              />
              <p className="text-xs opacity-60 whitespace-pre-wrap">{renderDay(series.template, n, series.total, series.notes[n])}</p>
              {keys.map((k) => failures[k] && <p key={k} className="text-xs text-red-600">{failures[k]}</p>)}
              {!past &&
                (moving?.day === n ? (
                  <div className="space-y-3 rounded-lg border border-dashed p-3 text-sm">
                    <div className="font-medium">Move Day {n} to another date</div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="space-y-1">
                        <span className="block text-xs opacity-70">New date · {dateFormatHint()}</span>
                        <input
                          type="date"
                          value={moving.date}
                          min={toDateInput(addDays(due, 1))}
                          onChange={(e) => setMoving({ day: n, date: e.target.value })}
                          className="rounded-md border bg-transparent px-3 py-1.5"
                        />
                      </label>
                      <button
                        onClick={() => moveDay(n, moving.date)}
                        disabled={!(newDays >= 1)}
                        className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-white disabled:opacity-50"
                      >
                        Move
                      </button>
                      <button onClick={() => setMoving(null)} className="rounded-md border px-4 py-1.5">
                        Cancel
                      </button>
                    </div>
                    {/* The chosen date spelled out, so day and month can't be mixed up. */}
                    <p className="text-xs opacity-70">
                      {newDays >= 1 ? (
                        <>
                          Day {n} will post on <b>{formatDate(addDays(due, newDays))}</b> at {formatTime(due)},{" "}
                          {newDays} day{newDays === 1 ? "" : "s"} later than planned.
                        </>
                      ) : (
                        <>Pick a date after {formatDate(due)}.</>
                      )}
                      {series.total > n && (
                        <>
                          {" "}
                          {series.total === n + 1 ? `Day ${n + 1} follows` : `Days ${n + 1} to ${series.total} follow`} by the
                          same amount.
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => setMoving({ day: n, date: toDateInput(addDays(due, 1)) })}
                    // While an earlier run is unconfirmed, dates must not change under it.
                    disabled={!!progress || !!series.pending?.length}
                    className="text-xs underline opacity-70 hover:opacity-100 disabled:opacity-40"
                  >
                    Can&apos;t show up? Move to another date
                  </button>
                ))}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
