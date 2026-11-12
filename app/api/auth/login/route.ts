import { NextResponse } from "next/server";
import { authorizeUrl, newPkce } from "@/lib/oauth";
import { seal } from "@/lib/session";

const PKCE_COOKIE = "sl_pkce";

/** Starts OAuth: stash verifier+state in a short-lived cookie, bounce to Buffer. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;

  // Fail with a readable message (env var NAMES only, never values) instead of a blank 500.
  const missing = ["BUFFER_CLIENT_ID", "BUFFER_CLIENT_SECRET", "SESSION_SECRET"].filter((k) => !process.env[k]);
  if (missing.length) {
    return new NextResponse(
      `Missing in .env.local: ${missing.join(", ")}. Add them, then restart "npm run dev".`,
      { status: 500 },
    );
  }
  if (process.env.SESSION_SECRET!.length < 32) {
    return new NextResponse("SESSION_SECRET must be at least 32 characters.", { status: 500 });
  }

  const { verifier, challenge, state } = newPkce();
  const res = NextResponse.redirect(authorizeUrl(origin, state, challenge));
  res.cookies.set(PKCE_COOKIE, seal({ verifier, state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from Buffer
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
