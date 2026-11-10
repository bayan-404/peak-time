import { NextResponse } from "next/server";
import { authorizeUrl, newPkce } from "@/lib/oauth";
import { seal } from "@/lib/session";

const PKCE_COOKIE = "sl_pkce";

/** Starts OAuth: stash verifier+state in a short-lived cookie, bounce to Buffer. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
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
