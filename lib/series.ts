// Pure series helpers (no I/O), safe to import from client components.

export const DEFAULT_TEMPLATE = "Day {n}/{total} {text}";
export const CHECK_IN_TEXT = "Showing up today. ✅";

/** "Day {n}/{total} {text}" → "Day 1/30 Shipped the login flow". Empty note → check-in. */
export function renderDay(template: string, n: number, total: number, note: string) {
  const text = note.trim() || CHECK_IN_TEXT;
  return template
    .replaceAll("{n}", String(n))
    .replaceAll("{total}", String(total))
    .replaceAll("{text}", text)
    .trim();
}
