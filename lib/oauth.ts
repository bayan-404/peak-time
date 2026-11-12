// Buffer OAuth 2.0: Authorization Code + PKCE, confidential client.
//
// IMPORTANT: Buffer refresh tokens are SINGLE-USE. Reusing one revokes the
// whole grant. So every refresh goes through `getAccessToken()` below, which
// de-duplicates concurrent refreshes. Never call `refreshTokens` elsewhere.
import "server-only";
import crypto from "node:crypto";
import { readSession, writeSession, type Session } from "./session";

const AUTHORIZE_URL = "https://auth.buffer.com/auth";
const TOKEN_URL = "https://auth.buffer.com/token";
// Override with BUFFER_SCOPES in .env.local to test without a scope the app doesn't list.
export const SCOPES = process.env.BUFFER_SCOPES || "posts:read posts:write account:read offline_access";
const REFRESH_EARLY_MS = 5 * 60_000; // refresh early so a schedule-all run never crosses expiry

function clientCreds() {
  const id = process.env.BUFFER_CLIENT_ID;
  const secret = process.env.BUFFER_CLIENT_SECRET;
  if (!id || !secret) throw new Error("BUFFER_CLIENT_ID / BUFFER_CLIENT_SECRET missing in .env.local");
  return { id, secret };
}

export function redirectUri(origin: string) {
  // Buffer compares this character for character, so a stray space or newline
  // pasted into the env var breaks login with a generic "could not connect" page.
  return process.env.BUFFER_REDIRECT_URI?.trim() || `${origin}/api/auth/callback`;
}

// ---------- PKCE ----------
export function newPkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

export function authorizeUrl(origin: string, state: string, challenge: string) {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: clientCreds().id,
    redirect_uri: redirectUri(origin),
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "consent",
  });
  return `${AUTHORIZE_URL}?${qs}`;
}

// ---------- Token endpoint ----------
type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<Session> {
  const { id, secret } = clientCreds();
  // Confidential client: secret sent in the form body (client_secret_post).
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ ...params, client_id: id, client_secret: secret }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(`Token request failed (${res.status}): ${json.error ?? "unknown"} ${json.error_description ?? ""}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

export function exchangeCode(code: string, verifier: string, origin: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri(origin),
  });
}

// In-flight + recently-finished refreshes, keyed by the OLD refresh token.
// Two requests arriving with the same stale cookie share one refresh
// instead of spending the single-use token twice.
const refreshes = new Map<string, Promise<Session>>();

function refreshOnce(refreshToken: string): Promise<Session> {
  let p = refreshes.get(refreshToken);
  if (!p) {
    p = tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    refreshes.set(refreshToken, p);
    // Keep the result briefly for late requests still carrying the old cookie.
    p.finally(() => setTimeout(() => refreshes.delete(refreshToken), 5 * 60_000));
  }
  return p;
}

/**
 * The ONE place tokens get refreshed. Returns a valid access token or null
 * if the user isn't connected. Call only from Route Handlers (it may set a cookie).
 */
export async function getAccessToken(): Promise<string | null> {
  const s = await readSession();
  if (!s) return null;
  if (Date.now() < s.expiresAt - REFRESH_EARLY_MS) return s.accessToken;
  if (!s.refreshToken) return null; // expired, can't refresh: reconnect

  const fresh = await refreshOnce(s.refreshToken);
  if (!fresh.refreshToken) fresh.refreshToken = s.refreshToken;
  await writeSession(fresh);
  return fresh.accessToken;
}
