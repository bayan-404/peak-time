import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { getOrganizationId, getScheduledPosts } from "@/lib/buffer";
import { getAccessToken } from "@/lib/oauth";

const MAX_ITEMS = 10; // one schedule batch
const minute = (iso: string) => Math.floor(Date.parse(iso) / 60000);

type Item = { key: string; channelId: string; dueAt: string };

/**
 * POST { items: Item[] } → { found: { key, postId, dueAt }[] }
 *
 * For posts whose create call never got an answer: looks in Buffer for a
 * scheduled post on the same channel at the same minute. Costs 2 requests,
 * and saves us from publishing the same day twice.
 */
export async function POST(req: Request) {
  const token = await getAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "Connect Buffer first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: Item[] };
  const items = body.items;
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > MAX_ITEMS ||
    items.some((it) => !it?.key || !it.channelId || Number.isNaN(Date.parse(it.dueAt)))
  ) {
    return NextResponse.json({ error: `Send 1–${MAX_ITEMS} valid items.` }, { status: 400 });
  }

  try {
    const times = items.map((it) => Date.parse(it.dueAt));
    const posts = await getScheduledPosts(
      token,
      await getOrganizationId(token),
      [...new Set(items.map((it) => it.channelId))],
      new Date(Math.min(...times) - 60_000).toISOString(),
      new Date(Math.max(...times) + 60_000).toISOString(),
    );

    const found = items.flatMap((it) => {
      const post = posts.find((p) => p.channelId === it.channelId && minute(p.dueAt) === minute(it.dueAt));
      return post ? [{ key: it.key, postId: post.id, dueAt: post.dueAt }] : [];
    });
    return NextResponse.json({ found });
  } catch (e) {
    return errorResponse(e);
  }
}
