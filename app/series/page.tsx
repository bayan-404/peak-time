"use client";

// Series list + "New series" form.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ServiceIcon from "@/components/ServiceIcon";
import { autoSummary, runSchedule } from "@/lib/schedule-run";
import {
  MAX_DAYS,
  autoDue,
  dateFormatHint,
  dueAtFor,
  formatDate,
  formatTime,
  renderDay,
  schedulePlan,
  seriesProblems,
  templateFor,
  toDateInput,
  type Series,
} from "@/lib/series";
import { deleteSeries, loadAll, saveSeries } from "@/lib/series-store";
import type { Channel } from "@/lib/types";

const input = "w-full rounded-md border px-3 py-2 bg-transparent";

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateInput(d);
}

export default function SeriesListPage() {
  const router = useRouter();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [list, setList] = useState<Series[]>([]);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [total, setTotal] = useState(30);
  const [startDate, setStartDate] = useState(tomorrow);
  const [time, setTime] = useState("09:00");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("");

  // Auto top-up: which series is being topped up now, and what each run did.
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  const [autoNotes, setAutoNotes] = useState<Record<string, string>>({});
  const autoRan = useRef(false);

  useEffect(() => {
    setList(loadAll());
    const err = new URLSearchParams(window.location.search).get("error");
    if (err) setError(err);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setConnected(d.connected));
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setChannels(d);
        setChannelIds(d[0] ? [d[0].id] : []);
      });
  }, [connected]);

  // Auto top-up: once per visit, give every series that asked for it the
  // chance to fill the room Buffer has now. One at a time, because they
  // share the Buffer login and its rate limit.
  useEffect(() => {
    if (!connected || autoRan.current) return;
    autoRan.current = true;
    (async () => {
      for (const s of loadAll()) {
        if (!autoDue(s)) continue;
        setToppingUp(s.id);
        const { outcome, added, series: after } = await runSchedule({ ...s, autoAt: Date.now() }, { save: saveSeries });
        const note = autoSummary(outcome, added, schedulePlan(after).items.length);
        setAutoNotes((notes) => ({ ...notes, [s.id]: note }));
        setList(loadAll());
      }
      setToppingUp(null);
    })();
  }, [connected]);

  function toggleChannel(id: string) {
    setChannelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  // Recomputed on every render, so the messages update as the user types.
  const problems = seriesProblems({ startDate, time, channelIds });
  // We build the post wording from the topic, so there is no template to get wrong.
  const template = templateFor(topic);

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (problems.length > 0) return;
    const s: Series = {
      id: crypto.randomUUID(),
      name: name.trim() || (topic.trim() ? `${total} days of ${topic.trim()}` : `${total}-day series`),
      total,
      startDate,
      time,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      channelIds,
      template,
      notes: {},
      posts: {},
      createdAt: new Date().toISOString(),
    };
    saveSeries(s);
    router.push(`/series/${s.id}`);
  }

  function remove(id: string) {
    if (!confirm("Delete this series here? Posts already in Buffer stay scheduled.")) return;
    deleteSeries(id);
    setList(loadAll());
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setConnected(false);
    setChannels([]);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Streakline</h1>
        <p className="opacity-70">Plan a “Day N of X” series and schedule every day to Buffer in one click.</p>
      </header>

      {error && <p className="text-red-600">{error}</p>}

      {connected === false && (
        <a href="/api/auth/login" className="inline-block rounded-md bg-[var(--accent)] px-4 py-2 text-white">
          Connect Buffer
        </a>
      )}

      {list.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Your series</h2>
          {list.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border p-3">
              <Link
                href={`/series/${s.id}`}
                // Not clickable while its top-up runs, so the series page can't start a second run.
                aria-disabled={toppingUp === s.id}
                className={toppingUp === s.id ? "pointer-events-none" : "hover:underline"}
              >
                <div className="font-medium">
                  {s.name}
                  {s.auto && (
                    <span className="ml-2 rounded-full bg-green-600/15 px-2 py-0.5 align-middle text-xs font-medium text-green-700">
                      Auto top-up
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-60">
                  {s.total} days · starts {formatDate(dueAtFor(s, 1))} at {formatTime(dueAtFor(s, 1))} ·{" "}
                  {Object.keys(s.posts).length} posts scheduled
                </div>
                {toppingUp === s.id ? (
                  <div className="text-xs">Checking Buffer for room…</div>
                ) : (
                  autoNotes[s.id] && <div className="text-xs">{autoNotes[s.id]}</div>
                )}
              </Link>
              <button
                onClick={() => remove(s.id)}
                disabled={toppingUp === s.id}
                className="text-sm opacity-60 hover:opacity-100 disabled:opacity-30"
              >
                Delete
              </button>
            </div>
          ))}
        </section>
      )}

      {connected && (
        <form onSubmit={create} className="space-y-4">
          <div className="flex justify-between">
            <h2 className="font-semibold">New series</h2>
            <button type="button" onClick={logout} className="text-sm underline opacity-70">
              Disconnect Buffer
            </button>
          </div>

          <label className="block space-y-1">
            <span className="text-sm">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="30 days of shipping" className={input} />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Days</span>
              <input
                type="number"
                min={1}
                max={MAX_DAYS}
                value={total}
                onChange={(e) => setTotal(Math.min(MAX_DAYS, Math.max(1, +e.target.value || 1)))}
                className={input}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">
                Start <span className="opacity-60">· {dateFormatHint()}</span>
              </span>
              <input
                type="date"
                value={startDate}
                min={toDateInput(new Date())}
                onChange={(e) => setStartDate(e.target.value)}
                className={input}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} required />
            </label>
          </div>

          {startDate && time && (
            // Spelled out, so the day and month can't be mixed up.
            <p className="rounded-md bg-[var(--foreground)]/5 px-3 py-2 text-sm">
              Day 1 posts on <b>{formatDate(dueAtFor({ startDate, time }, 1))}</b> at{" "}
              <b>{formatTime(dueAtFor({ startDate, time }, 1))}</b>
              {total > 1 && (
                <>
                  . Day {total} posts on <b>{formatDate(dueAtFor({ startDate, time }, total))}</b>
                </>
              )}
              .
            </p>
          )}

          <fieldset className="space-y-1">
            <legend className="text-sm">Channels</legend>
            {channels.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={channelIds.includes(c.id)} onChange={() => toggleChannel(c.id)} />
                <ServiceIcon service={c.service} className="h-4 w-4" />
                {c.name}
              </label>
            ))}
          </fieldset>

          <label className="block space-y-1">
            <span className="text-sm">
              What is the challenge about? <span className="opacity-60">· optional</span>
            </span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="coding my app" className={input} />
          </label>
          <div className="space-y-1">
            <span className="text-sm opacity-60">Your posts will look like this. You write each day&apos;s note on the next page.</span>
            <p className="rounded-xl border p-3 text-sm opacity-80">{renderDay(template, 1, total, "")}</p>
          </div>

          {problems.length > 0 && (
            <ul role="alert" className="space-y-1 text-sm text-red-600">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <button
            disabled={problems.length > 0}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
          >
            Create series
          </button>
        </form>
      )}
    </main>
  );
}
