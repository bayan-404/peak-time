import { NextResponse } from "next/server";
import { BufferApiError, createScheduledPost } from "@/lib/buffer";
import { getAccessToken } from "@/lib/oauth";

/** POST { channelId, text, dueAt } → schedules one post at dueAt. */
export async function POST(req: Request) {
  const token = await getAccessToken().catch(() => null);
  if (!token) return NextResponse.json({ error: "Connect Buffer first." }, { status: 401 });

  const { channelId, text, dueAt } = (await req.json().catch(() => ({}))) as Record<string, string>;
  const when = Date.parse(dueAt);
  if (!channelId || !text?.trim() || Number.isNaN(when)) {
    return NextResponse.json({ error: "channelId, text and dueAt are required." }, { status: 400 });
  }
  if (when <= Date.now()) {
    return NextResponse.json({ error: "Pick a time in the future." }, { status: 400 });
  }

  try {
    const post = await createScheduledPost(token, {
      channelId,
      text: text.trim(),
      dueAt: new Date(when).toISOString(),
    });
    return NextResponse.json(post);
  } catch (e) {
    console.error(e);
    // Buffer's mutation messages are user-facing ("text too long", etc.), so pass them on.
    const msg = e instanceof BufferApiError && e.code === "MUTATION" ? e.message : "Buffer rejected the post.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
