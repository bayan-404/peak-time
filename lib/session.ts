// Encrypted, httpOnly cookie storage for the user's Buffer tokens.
// No database: the cookie *is* the session. AES-256-GCM means the browser
// can carry it but can't read or tamper with it.
import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "sl_session";

export type Session = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch ms
};

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set (32+ chars) in .env.local");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function seal(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null; // tampered, old secret, or garbage: treat as logged out
  }
}

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function readSession(): Promise<Session | null> {
  return unseal<Session>((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Only callable from Route Handlers / Server Actions (Next.js rule). */
export async function writeSession(s: Session) {
  (await cookies()).set(SESSION_COOKIE, seal(s), cookieOpts);
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
