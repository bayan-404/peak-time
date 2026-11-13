import { NextResponse } from "next/server";
import { BufferApiError } from "./buffer";

/** Turns any error into a safe JSON response (no raw details leak to the browser). */
export function errorResponse(e: unknown) {
  if (e instanceof BufferApiError && e.code === "RATE_LIMITED") {
    return NextResponse.json(
      { error: "Buffer's rate limit is reached. Try again later.", retryAfter: e.info.retryAfter ?? 0 },
      { status: 429 },
    );
  }
  console.error(e);
  return NextResponse.json({ error: "Could not reach Buffer. Try again." }, { status: 502 });
}
