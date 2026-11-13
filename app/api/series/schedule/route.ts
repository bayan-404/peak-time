import { NextResponse } from "next/server";
import { BufferApiError, createScheduledPost } from "@/lib/buffer";
import { getAccessToken } from "@/lib/oauth";

// Small batches keep each request well under serverless time limits.
// The client sends batches one at a time, so only one token refresh can
// ever be in flight (refresh tokens are single-use).
const MAX_BATCH = 10;

type Item = { key: string; channelId: string; text: string; dueAt: string };
// `unknown`: we never heard back from Buffer, so the post may or may not exist.
type ScheduleResult = { key: string; postId?: string; dueAt?: string; error?: string; unknown?: boolean };

/**
 * POST { items: Item[] } → { results: ScheduleResult[], retryAfter: number | null, limit: string | null }
 *
 * Results are in item order but can be shorter than `items`: the batch stops
 * early at a rate limit (`retryAfter` = seconds to wait), at a plan limit
 * (`limit` = Buffer's message) or at an unknown outcome. Items without a
 * result were not created in Buffer.
 */
export async function POST(req: Request) {
  const token = await getAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "Connect Buffer first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: Item[] };
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BATCH) {
    return NextResponse.json({ error: `Send 1–${MAX_BATCH} items.` }, { status: 400 });
  }

  const results: ScheduleResult[] = [];
  let retryAfter: number | null = null;
  let limit: string | null = null;
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
      const { post, lowQuota } = await createScheduledPost(token, {
        channelId: it.channelId,
        text: it.text.trim(),
        dueAt: new Date(when).toISOString(),
      });
      results.push({ key: it.key, postId: post.id, dueAt: post.dueAt ?? it.dueAt });
      // Nearly out of quota: stop here instead of running into a 429.
      if (lowQuota !== null) {
        retryAfter = lowQuota;
        break;
      }
    } catch (e) {
      // A 429 means this post was not created. Sending the rest would only hit the same wall.
      if (e instanceof BufferApiError && e.code === "RATE_LIMITED") {
        retryAfter = e.info.retryAfter ?? 0;
        break;
      }
      // The Buffer plan has no room for more scheduled posts. Nothing is wrong
      // with this post, so it is not reported as failed.
      if (e instanceof BufferApiError && e.code === "LIMIT_REACHED") {
        limit = e.message;
        break;
      }
      console.error(e);
      // A network failure or 5xx doesn't say whether Buffer saved the post.
      // Never retry that blindly: the client checks Buffer first.
      if (!(e instanceof BufferApiError) || (e.info.status ?? 0) >= 500) {
        results.push({ key: it.key, unknown: true, error: "No clear answer from Buffer." });
        break;
      }
      // Buffer's own messages (plan limits, text too long…) are useful to the user.
      results.push({ key: it.key, error: e.message });
    }
  }
  return NextResponse.json({ results, retryAfter, limit });
}
