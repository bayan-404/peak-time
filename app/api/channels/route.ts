import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-error";
import { getChannels, getOrganizationId } from "@/lib/buffer";
import { getAccessToken } from "@/lib/oauth";

/** GET → Channel[]: the connected user's Buffer channels. */
export async function GET() {
  try {
    const token = await getAccessToken();
    if (!token) return NextResponse.json({ error: "Connect Buffer first." }, { status: 401 });
    return NextResponse.json(await getChannels(await getOrganizationId(token), token));
  } catch (e) {
    return errorResponse(e);
  }
}
