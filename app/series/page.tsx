"use client";

// Step 1 proof page: connect Buffer via OAuth and schedule ONE real "Day 1" post.
import { useEffect, useState } from "react";
import { DEFAULT_TEMPLATE, renderDay } from "@/lib/series";
import type { Channel } from "@/lib/types";

function defaultTime() {
  // Tomorrow 09:00 local, formatted for <input type="datetime-local">.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

export default function SeriesPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [total, setTotal] = useState(30);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(defaultTime);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
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
        setChannelId(d[0]?.id ?? "");
      });
  }, [connected]);

  const preview = renderDay(template, 1, total, note);

  async function schedule() {
    setError("");
    setStatus("Scheduling…");
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // datetime-local has no zone; Date() reads it as the browser's local time.
      body: JSON.stringify({ channelId, text: preview, dueAt: new Date(when).toISOString() }),
    });
    const data = await res.json();
    if (data.error) {
      setStatus("");
      return setError(data.error);
    }
    setStatus(`Scheduled ✓ post ${data.id} for ${new Date(data.dueAt).toLocaleString()} (${data.status})`);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setConnected(false);
    setChannels([]);
  }

  const input = "w-full rounded-md border px-3 py-2 bg-transparent";

  return (
    <main className="mx-auto max-w-xl px-4 py-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">Streakline</h1>
        <p className="opacity-70">Schedule Day 1 of your series to Buffer.</p>
      </header>

      {error && <p className="text-red-600">{error}</p>}

      {connected === false && (
        <a href="/api/auth/login" className="inline-block rounded-md bg-[var(--accent)] px-4 py-2 text-white">
          Connect Buffer
        </a>
      )}

      {connected && (
        <section className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="opacity-70">Connected to Buffer</span>
            <button onClick={logout} className="underline opacity-70">Disconnect</button>
          </div>

          <label className="block space-y-1">
            <span className="text-sm">Channel</span>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={input}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.service})</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm">Length (days)</span>
              <input type="number" min={1} max={365} value={total} onChange={(e) => setTotal(+e.target.value || 1)} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Post at</span>
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={input} />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-sm">Template</span>
            <input value={template} onChange={(e) => setTemplate(e.target.value)} className={input} />
          </label>

          <label className="block space-y-1">
            <span className="text-sm">Day 1 note (empty = check-in)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={input} />
          </label>

          <div className="rounded-xl border p-4 text-sm whitespace-pre-wrap">{preview}</div>

          <button
            onClick={schedule}
            disabled={!channelId || status === "Scheduling…"}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-50"
          >
            Schedule Day 1
          </button>
          {status && <p className="text-sm">{status}</p>}
        </section>
      )}
    </main>
  );
}
