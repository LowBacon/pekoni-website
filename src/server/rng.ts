import crypto from "node:crypto";

/**
 * Provably-fair randomness.
 *
 * Every outcome is derived from HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`).
 * The server seed is generated server-side and only its SHA-256 hash is exposed
 * until the player rotates it, at which point the old seed is revealed and any
 * past round can be recomputed.
 *
 * `Math.random()` is never used for anything that touches the wallet.
 */

export function randomSeed(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashSeed(seed: string): string {
  return crypto.createHash("sha256").update(seed).digest("hex");
}

function hmac(serverSeed: string, message: string): Buffer {
  return crypto.createHmac("sha256", serverSeed).update(message).digest();
}

/**
 * Deterministic float stream in [0, 1). `cursor` walks forward for games that
 * need more than one number from a single round (mines layout, slot reels...).
 */
export function fairFloat(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor = 0,
): number {
  const digest = hmac(serverSeed, `${clientSeed}:${nonce}:${cursor}`);
  // 52 bits of entropy assembled from the first 7 bytes.
  let value = 0;
  for (let i = 0; i < 6; i += 1) {
    value = value * 256 + digest[i];
  }
  return value / Math.pow(256, 6);
}

/** Integer in [min, max] inclusive. */
export function fairInt(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number,
  min: number,
  max: number,
): number {
  const span = max - min + 1;
  return min + Math.floor(fairFloat(serverSeed, clientSeed, nonce, cursor) * span);
}

/** Sequential float generator bound to one round. */
export function fairStream(serverSeed: string, clientSeed: string, nonce: number) {
  let cursor = 0;
  return {
    next(): number {
      const value = fairFloat(serverSeed, clientSeed, nonce, cursor);
      cursor += 1;
      return value;
    },
    nextInt(min: number, max: number): number {
      const value = this.next();
      return min + Math.floor(value * (max - min + 1));
    },
    get cursor() {
      return cursor;
    },
  };
}

/** Weighted pick using the fair stream. Weights must be positive integers. */
export function fairWeightedPick<T extends { weight: number }>(
  items: T[],
  roll: number,
): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) throw new Error("fairWeightedPick: total weight must be > 0");
  let ticket = roll * total;
  for (const item of items) {
    ticket -= Math.max(0, item.weight);
    if (ticket < 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Fisher–Yates driven by the fair stream — used for the mines layout so the
 * bomb positions are fixed at round start and cannot be influenced later.
 */
export function fairShuffle<T>(items: T[], stream: { next(): number }): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(stream.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Constant-time comparison for session tokens and idempotency checks. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
