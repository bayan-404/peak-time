import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/oauth";

export async function GET() {
  try {
    return NextResponse.json({ connected: !!(await getAccessToken()) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ connected: false });
  }
}
