// Series model + pure helpers (no I/O), safe to import from client components.

export const DEFAULT_TEMPLATE = "Day {n}/{total} {text}";
export const CHECK_IN_TEXT = "Showing up today. ✅";
export const MAX_DAYS = 365;
/** Weekdays as Date#getDay() numbers, in the order the form shows them (Monday first). */
export const WEEK = [1, 2, 3, 4, 5, 6, 0];

export type Series = {
  id: string;
  name: string;
  total: number; // number of days
  startDate: string; // "YYYY-MM-DD", in `timezone`
  time: string; // "HH:MM" post time on each posting day, in `timezone`
  timezone: string; // IANA zone of the creator's browser at creation
  channelIds: string[];
  template: string;
  notes: Record<number, string>; // day number → note (missing/empty = check-in)
  // `${day}:${channelId}` → the Buffer post we created for it
  posts: Record<string, { postId: string; dueAt: string }>;
  // Keys sent to Buffer whose outcome we never heard (dropped connection,
  // closed tab). Checked against Buffer before anything is created again.
  pending?: string[];
  // Weekdays the series posts on, as Date#getDay() numbers (0 = Sunday … 6 = Saturday).
  // Missing = every day, which is also what series made before this field mean.
  weekdays?: number[];
  // Day numbers that were pushed back by one posting day ("I didn't show up").
  // Each entry delays that day and every day after it; a day can appear twice.
  skips?: number[];
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

type Schedule = Pick<Series, "startDate" | "time" | "skips" | "weekdays">;

/** The posting weekdays, cleaned up. Missing or empty means every day. */
function postingDays(weekdays?: number[]) {
  const days = [...new Set(weekdays ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length > 0 ? days : WEEK;
}

export const postsEveryDay = (weekdays?: number[]) => postingDays(weekdays).length === 7;

/**
 * Days from the start date to posting day number `slot` (0 = the first one).
 * Day numbers never map to dates directly: they map to a slot, and slots only
 * fall on the chosen weekdays. That is what keeps a skip on the same weekdays.
 */
function slotOffset(s: Schedule, slot: number) {
  const [y, m, d] = s.startDate.split("-").map(Number);
  const startWeekday = new Date(y, m - 1, d).getDay();
  // How far each posting weekday is from the start date, nearest first.
  const offsets = postingDays(s.weekdays)
    .map((w) => (w - startWeekday + 7) % 7)
    .sort((a, b) => a - b);
  return Math.floor(slot / offsets.length) * 7 + offsets[slot % offsets.length];
}

/** The slot day `n` sits in: every skip at or before it moved it one slot later. */
const slotOf = (s: Schedule, n: number) => n - 1 + (s.skips ?? []).filter((k) => k <= n).length;

/**
 * When day `n` posts. Built with local Date parts, so it's correct across
 * DST changes as long as it runs in the series' timezone (the browser).
 */
export function dueAtFor(s: Schedule, n: number): Date {
  const [y, m, d] = s.startDate.split("-").map(Number);
  const [hh, mm] = s.time.split(":").map(Number);
  return new Date(y, m - 1, d + slotOffset(s, slotOf(s, n)), hh, mm);
}

/**
 * Pushes day `n` and every later day back by `slots` posting days. No day is
 * dropped and the order stays the same; the days just land on later slots.
 */
export function skipDay(s: Series, n: number, slots = 1): Series {
  return { ...s, skips: [...(s.skips ?? []), ...Array<number>(Math.max(0, slots)).fill(n)] };
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

/**
 * How many posting days day `n` has to move to reach `dateInput`. A date that
 * is not a posting day counts as the next one after it. NaN unless the date is
 * later than the day's current one.
 */
export function slotsUntil(s: Schedule, n: number, dateInput: string) {
  const days = daysUntil(dueAtFor(s, n), dateInput);
  if (!(days >= 1)) return NaN;
  const from = slotOf(s, n);
  const base = slotOffset(s, from);
  // Whole weeks are jumped in one step, so a far-away date costs nothing.
  let slots = Math.max(1, Math.floor(days / 7) * postingDays(s.weekdays).length);
  while (slotOffset(s, from + slots) - base < days) slots++;
  return slots;
}

/** "Mon" or "Monday", in the reader's own language. */
export function weekdayName(day: number, length: "short" | "long" = "short") {
  // 7 Jan 2024 was a Sunday, so adding `day` lands on that weekday.
  return new Date(2024, 0, 7 + day).toLocaleDateString(undefined, { weekday: length });
}

/** "every day", "every Saturday", "3 times a week (Mon, Wed, Fri)". */
export function scheduleLabel(weekdays?: number[]) {
  const days = postingDays(weekdays);
  if (days.length === 7) return "every day";
  if (days.length === 1) return `every ${weekdayName(days[0], "long")}`;
  const names = WEEK.filter((d) => days.includes(d)).map((d) => weekdayName(d));
  return `${days.length === 2 ? "twice" : `${days.length} times`} a week (${names.join(", ")})`;
}

/**
 * `count` weekdays spread through the week, starting on `first`. Used when the
 * user says "3 times a week" without naming days: 3 from Monday → Mon, Wed, Fri.
 */
export function spreadWeekdays(count: number, first: number) {
  return Array.from({ length: count }, (_, i) => (first + Math.floor((i * 7) / count)) % 7);
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
  s: Pick<Series, "startDate" | "time" | "channelIds" | "weekdays">,
  now = Date.now(),
): string[] {
  const problems: string[] = [];
  if (s.channelIds.length === 0) problems.push("Pick at least one channel.");
  if (s.weekdays?.length === 0) problems.push("Pick at least one day of the week to post on.");
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
