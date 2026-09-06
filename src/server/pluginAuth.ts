import "server-only";
import crypto from "node:crypto";
import { prisma } from "./db";

/**
 * Authentication for the Minecraft plugin.
 *
 * The plugin is the only caller allowed to say "this UUID belongs to that
 * person" and "the coins arrived", so a bearer token in a header is not enough:
 * anything that leaks one gets to mint coins in game. Requests are therefore
 * signed.
 *
 * Each request carries:
 *
 *   X-Pekoni-Timestamp   unix milliseconds
 *   X-Pekoni-Nonce       random, unique per request
 *   X-Pekoni-Signature   hex HMAC-SHA256 over `${ts}.${nonce}.${method}.${path}.${sha256(body)}`
 *
 * Signing the method and path stops a captured signature being replayed against
 * a different endpoint; the body hash stops the payload being edited; the
 * timestamp bounds how long a captured request stays useful; and the nonce
 * cache closes the remaining window inside that bound.
 *
 * Comparison is constant-time throughout, and a missing secret disables the
 * whole plugin surface rather than falling back to something weaker.
 */

const CLOCK_SKEW_MS = 5 * 60 * 1000;

export class PluginAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "PluginAuthError";
    this.status = status;
  }
}

export function pluginSecret(): string | null {
  const value = process.env.PEKONI_PLUGIN_SECRET?.trim();
  if (!value || value.length < 32) return null;
  return value;
}

export function isPluginConfigured(): boolean {
  return pluginSecret() !== null;
}

/* -------------------------------------------------------------------------- */
/* Nonce cache                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Seen nonces, held just longer than the accepted clock skew.
 *
 * Process-local, which is the right scope for a single deployment: the window
 * it has to cover is five minutes, not forever. Behind more than one instance
 * this needs to move to Redis, or two instances will each accept the same
 * replayed request once.
 */
const seenNonces = new Map<string, number>();
let lastSweep = Date.now();

function rememberNonce(nonce: string, now: number): boolean {
  if (now - lastSweep > 60_000) {
    for (const [key, seenAt] of seenNonces) {
      if (now - seenAt > CLOCK_SKEW_MS * 2) seenNonces.delete(key);
    }
    lastSweep = now;
  }
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, now);
  return true;
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

export function signPayload(
  secret: string,
  parts: { timestamp: string; nonce: string; method: string; path: string; body: string },
): string {
  const bodyHash = crypto.createHash("sha256").update(parts.body).digest("hex");
  const canonical = `${parts.timestamp}.${parts.nonce}.${parts.method.toUpperCase()}.${parts.path}.${bodyHash}`;
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Verifies a plugin request. Returns the raw body so the caller does not have
 * to read the stream twice — the signature covers the exact bytes checked here.
 */
export async function verifyPluginRequest(request: Request): Promise<string> {
  const secret = pluginSecret();
  if (!secret) {
    throw new PluginAuthError("Plugin-rajapinta ei ole käytössä.", 503);
  }

  const timestamp = request.headers.get("x-pekoni-timestamp");
  const nonce = request.headers.get("x-pekoni-nonce");
  const signature = request.headers.get("x-pekoni-signature");

  if (!timestamp || !nonce || !signature) {
    throw new PluginAuthError("Allekirjoitus puuttuu.", 401);
  }
  if (nonce.length < 8 || nonce.length > 128) {
    throw new PluginAuthError("Virheellinen nonce.", 401);
  }

  const sentAt = Number(timestamp);
  const now = Date.now();
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > CLOCK_SKEW_MS) {
    throw new PluginAuthError("Aikaleima on liian vanha tai tulevaisuudessa.", 401);
  }

  const body = await request.text();
  const path = new URL(request.url).pathname;
  const expected = signPayload(secret, {
    timestamp,
    nonce,
    method: request.method,
    path,
    body,
  });

  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    throw new PluginAuthError("Allekirjoitus ei täsmää.", 401);
  }

  // Last, so a replay of a *valid* request is refused rather than a nonce being
  // burned by anyone who can guess one.
  try {
    await prisma.pluginNonce.create({ data: { nonce, expiresAt: new Date(now + CLOCK_SKEW_MS * 2) } });
  } catch { throw new PluginAuthError("Pyyntö on jo käsitelty.", 409); }
  await prisma.pluginNonce.deleteMany({ where: { expiresAt: { lt: new Date(now) } } });

  return body;
}

/** Parses a verified body. Kept separate so the signature covers raw bytes. */
export function parsePluginBody<T>(body: string): T {
  if (!body) return {} as T;
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new PluginAuthError("Virheellinen JSON.", 400);
  }
}
