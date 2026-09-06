import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output as ZodOutput } from "zod";
import { AuthError } from "./auth";
import { WalletError } from "./wallet";
import { LimitError } from "./limits";
import { AccountError } from "./account";
import { MinecraftError } from "./minecraft";

/**
 * Shared plumbing for every route handler: one error shape, one place that
 * decides what a client is allowed to see, and a rate limiter in front of
 * anything that can move coins.
 */

export type ApiError = { error: string; code?: string };

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json<ApiError>({ error: message, code }, { status });
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/**
 * Maps a thrown error onto a response. Internal details are logged rather than
 * returned — a client only ever sees a message that is safe and actionable.
 */
export function handleError(error: unknown) {
  if (error instanceof AuthError) return fail(error.message, error.status);
  if (error instanceof WalletError) return fail(error.message, error.status, error.code);
  // These all carry a player-facing message and a code the UI branches on.
  if (error instanceof LimitError) return fail(error.message, error.status, error.code);
  if (error instanceof AccountError) return fail(error.message, error.status, error.code);
  if (error instanceof MinecraftError) return fail(error.message, error.status, error.code);
  if (error instanceof ZodError) {
    const first = error.errors[0];
    return fail(first?.message ?? "Virheellinen pyyntö.", 400, "VALIDATION");
  }
  if (error instanceof Error) {
    // Domain errors are written in Finnish and are safe to surface directly.
    // Anything else is a bug and must not leak its message.
    const isDomainError = /[äöÄÖ]|^[A-ZÄÖ][^:]*\.$/.test(error.message) && error.message.length < 160;
    if (isDomainError) return fail(error.message, 400);
    console.error("[pekoni] unhandled route error:", error);
    return fail("Jokin meni pieleen.", 500, "INTERNAL");
  }
  console.error("[pekoni] unknown route error:", error);
  return fail("Jokin meni pieleen.", 500, "INTERNAL");
}

/**
 * Parses and validates a JSON body.
 *
 * Generic over the schema rather than over a result type `T`. With
 * `ZodSchema<T>`, zod's input and output types are both bound to `T`, and for
 * any schema using `.default()` or `.coerce` those differ — TypeScript then
 * settles on the *input* side and every defaulted field reads as possibly
 * undefined at the call site, even though it can never be. Inferring
 * `z.output<S>` describes what `parse` actually returns.
 */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<ZodOutput<S>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    json = {};
  }
  return schema.parse(json) as ZodOutput<S>;
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/**
 * Token bucket, per user and per action.
 *
 * This is process-local, which is the right trade-off for a single deployment:
 * it stops runaway clients and accidental double-submits without adding an
 * external dependency. It is *not* the thing that protects the wallet — that is
 * the atomic conditional debit plus the idempotency key. Behind more than one
 * instance, move this to Redis.
 */
export function rateLimit(
  key: string,
  { capacity, refillPerSecond }: { capacity: number; refillPerSecond: number },
): boolean {
  const now = Date.now();

  if (now - lastSweep > 60_000) {
    for (const [id, bucket] of buckets) {
      if (now - bucket.updatedAt > 300_000) buckets.delete(id);
    }
    lastSweep = now;
  }

  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

export const LIMITS = {
  /** Full game rounds — generous enough for fast play, tight enough to stop scripts. */
  game: { capacity: 12, refillPerSecond: 4 },
  /** Individual tile reveals and grinder ticks. */
  tick: { capacity: 30, refillPerSecond: 12 },
  /** Anything that creates a durable record. */
  write: { capacity: 8, refillPerSecond: 1.5 },
  /** Sign-in attempts, per IP. */
  auth: { capacity: 8, refillPerSecond: 0.15 },
  /** Read-only endpoints polled by the UI. */
  read: { capacity: 40, refillPerSecond: 15 },
} as const;

export function requireRate(key: string, limit: { capacity: number; refillPerSecond: number }) {
  if (!rateLimit(key, limit)) {
    throw new AuthError("Liian monta pyyntöä. Hetki hengähdystä.", 429);
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}
