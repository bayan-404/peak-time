import { NextResponse } from "next/server";
import { analyzePosts } from "@/lib/analyze";
import { demoPosts } from "@/lib/demo-data";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const channelId = params.get("channelId");
  const tz = params.get("tz") || "UTC";
  const demo = params.get("demo") === "1";

  if (!channelId) {
    return NextResponse.json({ error: "channelId is required" }, { status: 400 });
  }
  if (!isValidTimeZone(tz)) {
    return NextResponse.json({ error: "Invalid tz" }, { status: 400 });
  }

  if (demo) {
    return NextResponse.json(analyzePosts(demoPosts(channelId), tz));
  }

  // TODO: fetch sent posts + metrics via lib/buffer.ts, cache ~10 min, then analyzePosts().
  return NextResponse.json(
    { error: "Live Buffer data not wired up yet. Try ?demo=1" },
    { status: 501 },
  );
}

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
