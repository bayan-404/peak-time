// The scheduling run, shared by the series page (button click) and the
// auto top-up (app open). Browser-only: it calls our API routes and saves
// progress through the `save` hook after every step.
import { formatWait, schedulePlan, type Series } from "./series";

const BATCH = 10; // must match the API's MAX_BATCH
type Result = { key: string; postId?: string; dueAt?: string; error?: string; unknown?: boolean };

export type RunOutcome =
  | { status: "done" } // nothing left to schedule
  | { status: "limit"; message: string } // the Buffer plan is full
  | { status: "rate"; retryAfter: number } // Buffer's rate limit, seconds to wait
  | { status: "unknown" } // lost the connection; checked against Buffer on the next run
  | { status: "disconnected" } // the Buffer login expired
  | { status: "busy" } // another tab is scheduling this series right now
  | { status: "stopped"; message: string }; // Buffer or our API refused

export type RunHooks = {
  save: (s: Series) => void;
  progress?: (done: number, total: number) => void;
  failures?: (failed: Record<string, string>) => void;
};

// createPost is not idempotent, so two runs of one series at the same time
// (two tabs, or the auto top-up plus a click) would post days twice. A short
// lease in localStorage keeps them apart; it expires if a tab is closed mid-run.
const LOCK_TTL_MS = 90_000;
const lockKey = (id: string) => `streakline:lock:${id}`;

function takeLock(id: string) {
  try {
    const held = Number(localStorage.getItem(lockKey(id)));
    if (held && Date.now() - held < LOCK_TTL_MS) return false;
    localStorage.setItem(lockKey(id), String(Date.now()));
  } catch {
    // No storage (private mode): nothing to coordinate with, carry on.
  }
  return true;
}
const renewLock = (id: string) => {
  try {
    localStorage.setItem(lockKey(id), String(Date.now()));
  } catch {}
};
const dropLock = (id: string) => {
  try {
    localStorage.removeItem(lockKey(id));
  } catch {}
};

/**
 * Schedules every remaining day until done or until Buffer says stop.
 * Returns the latest series, how many posts were added, and why it ended.
 */
export async function runSchedule(
  start: Series,
  hooks: RunHooks,
): Promise<{ outcome: RunOutcome; series: Series; added: number }> {
  if (!takeLock(start.id)) return { outcome: { status: "busy" }, series: start, added: 0 };

  let cur = start;
  let added = 0;
  const save = (next: Series) => {
    cur = next;
    hooks.save(next);
  };
  const end = (outcome: RunOutcome) => ({ outcome, series: cur, added });

  try {
    save(cur); // persists e.g. the auto top-up timestamp set by the caller

    // Refresh the token once up front, so batches never race a refresh.
    const me = await fetch("/api/auth/me").then((r) => r.json());
    if (!me.connected) return end({ status: "disconnected" });

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
          return end(
            data.retryAfter
              ? { status: "rate", retryAfter: data.retryAfter }
              : { status: "stopped", message: data.error ?? "Could not check Buffer. Try again." },
          );
        }
        for (const r of data.found) {
          posts[r.key] = { postId: r.postId!, dueAt: r.dueAt! };
          added++;
        }
      }
      save({ ...cur, posts, pending: undefined });
    }

    const items = schedulePlan(cur).items;
    hooks.progress?.(0, items.length);
    const failed: Record<string, string> = {};
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      renewLock(cur.id);
      // Mark the batch as in flight first: if the tab closes or the network
      // drops before the answer arrives, the next run knows to check Buffer.
      save({ ...cur, pending: batch.map((b) => b.key) });

      const res = await fetch("/api/series/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch.map(({ key, channelId, text, dueAt }) => ({ key, channelId, text, dueAt })) }),
      });
      const data = (await res.json().catch(() => null)) as {
        results?: Result[];
        retryAfter?: number | null;
        limit?: string | null;
        error?: string;
      } | null;
      if (!data?.results) {
        // A 4xx with a message was refused before anything reached Buffer.
        if (res.status < 500 && data?.error) {
          save({ ...cur, pending: undefined });
          return end({ status: "stopped", message: data.error });
        }
        return end({ status: "unknown" });
      }

      const posts = { ...cur.posts };
      const unknown: string[] = [];
      for (const r of data.results) {
        if (r.postId) {
          posts[r.key] = { postId: r.postId, dueAt: r.dueAt! };
          added++;
        } else if (r.unknown) unknown.push(r.key);
        else failed[r.key] = r.error ?? "Failed";
      }
      // Save after every batch so a closed tab never loses what Buffer already has.
      save({ ...cur, posts, pending: unknown.length > 0 ? unknown : undefined });
      hooks.failures?.({ ...failed });
      hooks.progress?.(Math.min(i + data.results.length, items.length), items.length);

      if (unknown.length > 0) return end({ status: "unknown" });

      // The Buffer plan is full. The rest stay "not scheduled", not failed.
      if (data.limit) return end({ status: "limit", message: data.limit });

      // Out of quota with posts still to go: stop and say when to come back.
      if (data.retryAfter != null && i + data.results.length < items.length) {
        return end({ status: "rate", retryAfter: data.retryAfter });
      }

      // A whole batch failing usually means a bad token or a broken post: stop, don't hammer.
      if (data.results.length > 0 && data.results.every((r) => r.error)) {
        return end({ status: "stopped", message: data.results[0].error! });
      }
    }
    return end({ status: "done" });
  } catch {
    // The request itself failed, so we don't know what Buffer received.
    return end({ status: "unknown" });
  } finally {
    dropLock(start.id);
  }
}

/** One line telling the user what an automatic top-up did. Empty = nothing worth saying. */
export function autoSummary(outcome: RunOutcome, added: number, waiting: number) {
  const more = added > 0 ? `${added} more post${added === 1 ? "" : "s"} scheduled. ` : "";
  switch (outcome.status) {
    case "done":
      return added > 0 ? `${more}Every day is now in Buffer.` : "";
    case "limit":
      return `${more}Buffer is full${added > 0 ? " again" : ""}, ${waiting} still waiting. It continues next time you open Streakline.`;
    case "rate":
      return `${more}Paused by Buffer's rate limit for about ${formatWait(outcome.retryAfter)}.`;
    case "unknown":
      return "Interrupted. Open the series and click the button to continue safely.";
    case "disconnected":
      return "Reconnect Buffer to continue.";
    case "stopped":
      return `${more}Stopped: ${outcome.message}`;
    case "busy":
      return "";
  }
}
