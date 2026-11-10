import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/oauth";
import { unseal, writeSession } from "@/lib/session";

const PKCE_COOKIE = "sl_pkce";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (msg?: string) =>
    NextResponse.redirect(new URL(`/series${msg ? `?error=${encodeURIComponent(msg)}` : ""}`, url.origin));

  const jar = await cookies();
  const pkce = unseal<{ verifier: string; state: string }>(jar.get(PKCE_COOKIE)?.value);
  jar.delete({ name: PKCE_COOKIE, path: "/api/auth" });

  if (url.searchParams.get("error")) return back(url.searchParams.get("error")!);
  const code = url.searchParams.get("code");
  if (!code || !pkce || url.searchParams.get("state") !== pkce.state) {
    return back("Login expired or state mismatch. Try again.");
  }

  try {
    await writeSession(await exchangeCode(code, pkce.verifier, url.origin));
    return back();
  } catch (e) {
    console.error(e);
    return back("Could not finish connecting to Buffer.");
  }
}
