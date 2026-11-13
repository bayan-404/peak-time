import { NextResponse } from "next/server";
import { BufferApiError, moveScheduledPost } from "@/lib/buffer";
import { getAccessToken } from "@/lib/oauth";

const MAX_BATCH = 10; // same size as a schedule batch

type Item = { key: string; postId: string; dueAt: string };
type MoveResult = { key: string; dueAt?: string; error?: string };

/**
 * POST { items: Item[] } → { results: MoveResult[], retryAfter: number | null }
 *
 * Moves scheduled posts to a new time after a day was pushed back. Results
 * are in item order and can be shorter than `items` when a rate limit stops
 * the batch. Moving is safe to repeat, so the client just retries what is left.
 */
export async function POST(req: Request) {
  const token = await getAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "Connect Buffer first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: Item[] };
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BATCH) {
    return NextResponse.json({ error: `Send 1–${MAX_BATCH} items.` }, { status: 400 });
  }

  const results: MoveResult[] = [];
  let retryAfter: number | null = null;
  // Sequential on purpose: Buffer's rate limit is shared per client.
  for (const it of items) {
    const when = Date.parse(it?.dueAt);
    if (!it?.key || !it.postId || Number.isNaN(when)) {
      results.push({ key: it?.key, error: "Invalid item." });
      continue;
    }
    if (when <= Date.now()) {
      results.push({ key: it.key, error: "Time is in the past." });
      continue;
    }
    try {
      const { dueAt, lowQuota } = await moveScheduledPost(token, {
        id: it.postId,
        dueAt: new Date(when).toISOString(),
      });
      results.push({ key: it.key, dueAt });
      if (lowQuota !== null) {
        retryAfter = lowQuota;
        break;
      }
    } catch (e) {
      if (e instanceof BufferApiError && e.code === "RATE_LIMITED") {
        retryAfter = e.info.retryAfter ?? 0;
        break;
      }
      console.error(e);
      // Buffer's own messages are useful; anything else is a connection problem.
      const known = e instanceof BufferApiError && (e.info.status ?? 0) < 500;
      results.push({ key: it.key, error: known ? e.message : "Could not reach Buffer." });
      if (!known) break;
    }
  }
  return NextResponse.json({ results, retryAfter });
}
