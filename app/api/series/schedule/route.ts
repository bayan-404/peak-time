import { NextResponse } from "next/server";
import { BufferApiError, createScheduledPost } from "@/lib/buffer";
import { getAccessToken } from "@/lib/oauth";

// Small batches keep each request well under serverless time limits.
// The client sends batches one at a time, so only one token refresh can
// ever be in flight (refresh tokens are single-use).
const MAX_BATCH = 10;

type Item = { key: string; channelId: string; text: string; dueAt: string };
type ScheduleResult = { key: string; postId?: string; dueAt?: string; error?: string };

/** POST { items: Item[] } → { results: ScheduleResult[] } (one per item, same order). */
export async function POST(req: Request) {
  const token = await getAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "Connect Buffer first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: Item[] };
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BATCH) {
    return NextResponse.json({ error: `Send 1–${MAX_BATCH} items.` }, { status: 400 });
  }

  const results: ScheduleResult[] = [];
  // Sequential on purpose: Buffer's rate limit is shared per client.
  for (const it of items) {
    const when = Date.parse(it?.dueAt);
    if (!it?.key || !it.channelId || !it.text?.trim() || Number.isNaN(when)) {
      results.push({ key: it?.key, error: "Invalid item." });
      continue;
    }
    if (when <= Date.now()) {
      results.push({ key: it.key, error: "Time is in the past." });
      continue;
    }
    try {
      const post = await createScheduledPost(token, {
        channelId: it.channelId,
        text: it.text.trim(),
        dueAt: new Date(when).toISOString(),
      });
      results.push({ key: it.key, postId: post.id, dueAt: post.dueAt ?? it.dueAt });
    } catch (e) {
      console.error(e);
      // Buffer's own messages (plan limits, text too long…) are useful to the user.
      results.push({ key: it.key, error: e instanceof BufferApiError ? e.message : "Buffer rejected the post." });
    }
  }
  return NextResponse.json({ results });
}
