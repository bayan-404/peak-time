import type { BestTimesResult, PostSample, Slot } from "./types";

// Pure logic: posts in → heatmap out. No network calls here,
// so it can be tested with demo data before the API works.

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MIN_POSTS_PER_SLOT = 2; // one lucky viral post shouldn't crown a slot
const SPARSE_THRESHOLD = 15; // below this, group hours into 3-hour blocks

/** Weekday (0 = Mon) and hour of a timestamp, in the user's timezone. */
function localDayHour(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  return { day: DAYS.indexOf(weekday), hour };
}

export function analyzePosts(
  posts: PostSample[],
  timeZone = "UTC",
): BestTimesResult {
  // Use engagement *rate* only if every post has impressions; mixing
  // rates and raw counts would make the comparison meaningless.
  const useRate = posts.length > 0 && posts.every((p) => (p.impressions ?? 0) > 0);
  const blockHours: 1 | 3 = posts.length < SPARSE_THRESHOLD ? 3 : 1;

  const sums = grid(0);
  const counts = grid(0);

  for (const p of posts) {
    const { day, hour } = localDayHour(p.sentAt, timeZone);
    if (day < 0) continue;
    const bucket = Math.floor(hour / blockHours) * blockHours;
    const engagements = p.reactions + p.comments + (p.shares ?? 0);
    const score = useRate ? engagements / p.impressions! : engagements;
    sums[day][bucket] += score;
    counts[day][bucket] += 1;
  }

  const heatmap = sums.map((row, d) =>
    row.map((sum, h) => (counts[d][h] > 0 ? sum / counts[d][h] : null)),
  );

  const slots: Slot[] = [];
  heatmap.forEach((row, day) =>
    row.forEach((score, hour) => {
      if (score !== null && counts[day][hour] >= MIN_POSTS_PER_SLOT) {
        slots.push({ day, hour, score, posts: counts[day][hour] });
      }
    }),
  );
  const topSlots = slots.sort((a, b) => b.score - a.score).slice(0, 3);

  const overall = average(
    posts.map((p) => {
      const e = p.reactions + p.comments + (p.shares ?? 0);
      return useRate ? e / p.impressions! : e;
    }),
  );

  return {
    heatmap,
    counts,
    topSlots,
    tip: makeTip(topSlots[0], overall, blockHours, posts.length),
    postCount: posts.length,
    blockHours,
    metric: useRate ? "engagement rate" : "engagements",
  };
}

function makeTip(best: Slot | undefined, overall: number, blockHours: number, n: number) {
  if (n === 0) return "No sent posts found yet. Publish a few and check back.";
  if (!best || overall === 0)
    return "Not enough posts per time slot yet. Keep posting at varied times to find your peak.";
  const ratio = best.score / overall;
  const end = best.hour + blockHours;
  const when = blockHours === 1 ? formatHour(best.hour) : `${formatHour(best.hour)}–${formatHour(end % 24)}`;
  return `Your posts on ${DAYS[best.day]} at ${when} get ${ratio.toFixed(1)}× your average engagement.`;
}

export function formatHour(h: number) {
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
}

function grid(fill: number) {
  return Array.from({ length: 7 }, () => Array<number>(24).fill(fill));
}

function average(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
