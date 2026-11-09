import { NextResponse } from "next/server";
import { demoChannels } from "@/lib/demo-data";

export async function GET(req: Request) {
  const demo = new URL(req.url).searchParams.get("demo") === "1";
  if (demo) return NextResponse.json(demoChannels);

  // TODO: replace with getChannels() from lib/buffer.ts once fields are confirmed.
  return NextResponse.json(
    { error: "Live Buffer data not wired up yet. Try ?demo=1" },
    { status: 501 },
  );
}
