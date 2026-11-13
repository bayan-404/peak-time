// First screen for someone who has not connected Buffer yet: says what the app
// does, how it works in three steps, and offers the one action that matters.
import Link from "next/link";

const TILE = 44;
const GAP = 8;
const DONE = 3; // days already "posted" in the picture
const NEXT = 4; // the day being lifted out of the grid

// A small picture of the idea: a run of numbered days, some done, one up next.
function DayTiles() {
  const days = [1, 2, 3, 4, 5, 6, 7, 8];
  return (
    <svg viewBox="-8 -12 216 124" className="mx-auto h-auto w-56" role="img" aria-label="Eight numbered days. The first three are done and day four is next.">
      {days.map((day) => {
        const x = ((day - 1) % 4) * (TILE + GAP);
        const y = Math.floor((day - 1) / 4) * (TILE + GAP);
        const label = (fill: string, opacity = 1) => (
          <text x={x + TILE / 2} y={y + TILE / 2 + 6} textAnchor="middle" fontSize="17" fontWeight="600" fill={fill} opacity={opacity}>
            {day}
          </text>
        );
        if (day <= DONE) {
          return (
            <g key={day}>
              <rect x={x} y={y} width={TILE} height={TILE} rx="10" fill="var(--accent)" opacity={0.35 + day * 0.2} />
              {label("#fff")}
            </g>
          );
        }
        if (day === NEXT) {
          return (
            <g key={day} transform={`rotate(9 ${x + TILE / 2} ${y + TILE / 2}) translate(3 -7)`}>
              <rect x={x + 2} y={y + 4} width={TILE} height={TILE} rx="10" fill="currentColor" opacity="0.18" />
              <rect x={x} y={y} width={TILE} height={TILE} rx="10" fill="var(--background)" stroke="var(--accent)" strokeWidth="2" />
              {label("var(--accent)")}
            </g>
          );
        }
        return (
          <g key={day}>
            <rect x={x} y={y} width={TILE} height={TILE} rx="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
            {label("currentColor", 0.4)}
          </g>
        );
      })}
    </svg>
  );
}

const STEPS = [
  ["Connect Buffer", "So Streakline can schedule to your channels."],
  ["Set up your challenge", "Number of days, how often, start date, time, and where to post."],
  ["Write and schedule", "Add a short note per day, then send them all at once."],
];

export default function Welcome() {
  return (
    <section className="rounded-2xl bg-black/[.04] px-6 py-10 text-center sm:px-10 dark:bg-white/[.06]">
      <DayTiles />

      <h2 className="mt-8 text-2xl font-semibold tracking-tight text-balance">
        Schedule your whole <span className="whitespace-nowrap">“Day 1 of 30”</span> challenge at once
      </h2>
      <p className="mx-auto mt-3 max-w-md opacity-70 text-pretty">
        Streakline turns a challenge into a series of daily posts. Plan every day up front, and Buffer
        publishes them for you, so your streak never breaks.
      </p>

      <ol className="mx-auto mt-8 max-w-sm space-y-4 text-left">
        {STEPS.map(([title, detail], i) => (
          <li key={title} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-sm opacity-70">{detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <a
        href="/api/auth/login"
        className="mt-8 inline-block rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Connect Buffer
      </a>
      <p className="mt-4 text-xs opacity-60">
        Nothing is posted without your click.{" "}
        <Link href="/privacy" className="underline hover:opacity-100">
          Privacy
        </Link>
      </p>
    </section>
  );
}
