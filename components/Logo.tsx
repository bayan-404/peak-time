// Streakline's mark: a tally of days with the fifth stroke as the "streak line".
// The bars follow the text color and the slash follows --accent, so it works in
// light and dark mode without separate files.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M8 7v18M13.5 7v18M19 7v18M24.5 7v18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M3.5 21.5 28.5 10.5" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="text-xl font-semibold tracking-tight">Streakline</span>
    </span>
  );
}
