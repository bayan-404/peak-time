import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { getChannels, getOrganizationId } from "@/lib/buffer";
import { cached } from "@/lib/cache";
import { demoChannels } from "@/lib/demo-data";

export async function GET(req: Request) {
  const demo = new URL(req.url).searchParams.get("demo") === "1";
  if (demo) return NextResponse.json(demoChannels);

  try {
    const channels = await cached("channels", async () =>
      getChannels(await getOrganizationId()),
    );
    return NextResponse.json(channels);
  } catch (e) {
    return errorResponse(e);
  }
}
