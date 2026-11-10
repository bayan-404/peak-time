// Tiny in-memory cache. Saves Buffer's shared rate limit and makes
// repeat views instant. Resets when the server restarts, which is fine
// because Buffer metrics only refresh daily anyway.

const TTL_MS = 10 * 60 * 1000;
const store = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await load();
  store.set(key, { at: Date.now(), value });
  return value;
}
