// Series model + pure helpers (no I/O), safe to import from client components.

export const DEFAULT_TEMPLATE = "Day {n}/{total} {text}";
export const CHECK_IN_TEXT = "Showing up today. ✅";
export const MAX_DAYS = 365;

export type Series = {
  id: string;
  name: string;
  total: number; // number of days
  startDate: string; // "YYYY-MM-DD", in `timezone`
  time: string; // "HH:MM" daily post time, in `timezone`
  timezone: string; // IANA zone of the creator's browser at creation
  channelIds: string[];
  template: string;
  notes: Record<number, string>; // day number → note (missing/empty = check-in)
  // `${day}:${channelId}` → the Buffer post we created for it
  posts: Record<string, { postId: string; dueAt: string }>;
  // Keys sent to Buffer whose outcome we never heard (dropped connection,
  // closed tab). Checked against Buffer before anything is created again.
  pending?: string[];
  // Day numbers that were pushed back by one day ("I didn't show up").
  // Each entry delays that day and every day after it; a day can appear twice.
  skips?: number[];
  // Auto top-up: when the app is opened, schedule the next days as soon as
  // Buffer has room. `autoAt` is when it last tried (epoch ms).
  auto?: boolean;
  autoAt?: number;
  createdAt: string;
};

export type PlanItem = { key: string; day: number; channelId: string; text: string; dueAt: string };

export const dayKey = (day: number, channelId: string) => `${day}:${channelId}`;

/** "Day {n}/{total} {text}" → "Day 1/30 Shipped the login flow". Empty note → check-in. */
export function renderDay(template: string, n: number, total: number, note: string | undefined) {
  const text = note?.trim() || CHECK_IN_TEXT;
  return template
    .replaceAll("{n}", String(n))
    .replaceAll("{total}", String(total))
    .replaceAll("{text}", text)
    .trim();
}

/**
 * When day `n` posts. Built with local Date parts, so it's correct across
 * DST changes as long as it runs in the series' timezone (the browser).
 */
export function dueAtFor(s: Pick<Series, "startDate" | "time" | "skips">, n: number): Date {
  const [y, m, d] = s.startDate.split("-").map(Number);
  const [hh, mm] = s.time.split(":").map(Number);
  // Every skip at or before day n moved it one day later.
  const delay = (s.skips ?? []).filter((k) => k <= n).length;
  return new Date(y, m - 1, d + n - 1 + delay, hh, mm);
}

/** Pushes day `n` and every later day back by `days` days. No day is dropped. */
export function skipDay(s: Series, n: number, days = 1): Series {
  return { ...s, skips: [...(s.skips ?? []), ...Array<number>(Math.max(0, days)).fill(n)] };
}

/**
 * Whole days from `from` to a "YYYY-MM-DD" date. Counted on calendar dates
 * (not milliseconds) so a daylight-saving change never makes it off by one.
 */
export function daysUntil(from: Date, dateInput: string) {
  const [y, m, d] = dateInput.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);
}

export type MoveItem = { key: string; postId: string; text: string; dueAt: string };

const sameMinute = (a: string, b: Date) => Math.floor(Date.parse(a) / 60000) === Math.floor(b.getTime() / 60000);

/**
 * Posts already in Buffer whose time no longer matches the plan (after a skip).
 * Idempotent like schedulePlan: a post drops off this list once it is moved,
 * so an interrupted run can simply be continued. Earliest day first, because
 * that is the post closest to going out.
 */
export function movePlan(s: Series, now = Date.now()): MoveItem[] {
  const items: MoveItem[] = [];
  for (let n = 1; n <= s.total; n++) {
    const due = dueAtFor(s, n);
    for (const channelId of s.channelIds) {
      const key = dayKey(n, channelId);
      const post = s.posts[key];
      // A post whose old time has passed was already published: nothing to move.
      if (!post || Date.parse(post.dueAt) <= now || sameMinute(post.dueAt, due)) continue;
      // Buffer rejects an edit without text, so the post's text is sent again.
      // Notes are locked once a day is scheduled, so this equals what Buffer has.
      const text = renderDay(s.template, n, s.total, s.notes[n]);
      items.push({ key, postId: post.postId, text, dueAt: due.toISOString() });
    }
  }
  return items;
}

/**
 * Builds the post shape from a plain-language topic, so the user never has to
 * learn {placeholders}. "coding my app" → "Day {n}/{total} of coding my app: {text}".
 */
export function templateFor(topic: string) {
  const t = topic.trim().replace(/[{}]/g, ""); // braces would be read as placeholders
  return t ? `Day {n}/{total} of ${t}: {text}` : DEFAULT_TEMPLATE;
}

/**
 * Why a new series can't be created yet, as messages to show the user.
 * Empty list = valid. Kept here (not in the form) so the rules are testable.
 */
export function seriesProblems(
  s: Pick<Series, "startDate" | "time" | "channelIds">,
  now = Date.now(),
): string[] {
  const problems: string[] = [];
  if (s.channelIds.length === 0) problems.push("Pick at least one channel.");
  if (!s.startDate || !s.time) {
    problems.push("Pick a start date and time.");
  } else if (dueAtFor(s, 1).getTime() <= now) {
    // Buffer can't schedule in the past, so the first post must still be ahead of us.
    problems.push("The first post is in the past. Pick a later start date or time.");
  }
  return problems;
}

/**
 * What still needs scheduling. Idempotent: days already in `posts` are skipped,
 * so "Schedule all" can be clicked again to retry only the failures.
 */
export function schedulePlan(s: Series, now = Date.now()) {
  const items: PlanItem[] = [];
  let past = 0;
  let done = 0;
  for (let n = 1; n <= s.total; n++) {
    const due = dueAtFor(s, n);
    for (const channelId of s.channelIds) {
      const key = dayKey(n, channelId);
      if (s.posts[key]) done++;
      else if (due.getTime() <= now) past++;
      else items.push({ key, day: n, channelId, text: renderDay(s.template, n, s.total, s.notes[n]), dueAt: due.toISOString() });
    }
  }
  return { items, past, done };
}

/** "Sat, Nov 14, 2026", in the reader's own language and order. */
export const formatDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** "9:00 AM" or "09:00", whichever the reader's locale uses. */
export const formatTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/**
 * The order a date is typed in for this reader, e.g. "MM/DD/YYYY" or
 * "DD.MM.YYYY". Shown next to date fields so 03/04 is never ambiguous.
 */
export function dateFormatHint() {
  const names: Record<string, string> = { day: "DD", month: "MM", year: "YYYY" };
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(2026, 10, 25))
    .map((part) => names[part.type] ?? part.value)
    .join("");
}

const AUTO_RETRY_MS = 15 * 60_000;

/**
 * Should the auto top-up try now? Yes when it is on, days are waiting, and
 * either one of our posts went out since the last try (a slot is free) or
 * enough time passed for other posts in Buffer to have gone out. This keeps
 * every page view from spending a Buffer request on a queue that is still full.
 */
export function autoDue(s: Series, now = Date.now()) {
  if (!s.auto || schedulePlan(s, now).items.length === 0) return false;
  const last = s.autoAt ?? 0;
  if (now - last > AUTO_RETRY_MS) return true;
  return Object.values(s.posts).some((p) => {
    const t = Date.parse(p.dueAt);
    return t > last && t <= now;
  });
}

export function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 753 → "13 minutes". For telling the user how long a rate limit lasts. */
export function formatWait(seconds: number) {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 3600) return plural(Math.max(1, Math.ceil(seconds / 60)), "minute");
  if (seconds < 86400) return plural(Math.ceil(seconds / 3600), "hour");
  return plural(Math.ceil(seconds / 86400), "day");
}
