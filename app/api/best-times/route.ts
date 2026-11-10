import { NextResponse } from "next/server";
import { analyzePosts } from "@/lib/analyze";
import { errorResponse } from "@/lib/api-error";
import { getOrganizationId, getSentPosts } from "@/lib/buffer";
import { cached } from "@/lib/cache";
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

  try {
    // Cache the raw posts (not the analysis) so each timezone reuses one fetch.
    const { posts, metricsUpdatedAt } = await cached(`posts:${channelId}`, async () =>
      getSentPosts(await getOrganizationId(), channelId),
    );
    return NextResponse.json({ ...analyzePosts(posts, tz), metricsUpdatedAt });
  } catch (e) {
    return errorResponse(e);
  }
}

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
