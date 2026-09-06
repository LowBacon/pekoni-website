import { rollDice, type DiceDirection } from "@/lib/games/dice";
import { spinSlots } from "@/lib/games/slots";
import { crashPointFrom } from "@/lib/games/crash";
import type { FairStream } from "@/lib/games/types";

/**
 * Independent verification of a settled round, in the player's own browser.
 *
 * This is what makes "provably fair" a claim rather than a slogan. The site
 * commits to a server seed by publishing its SHA-256 hash *before* any round is
 * played. When the player rotates the seed, the old one is revealed, and every
 * round played under it can be recomputed here — using the same payout modules
 * the server used, from `src/lib/games`, not a re-implementation that could
 * quietly disagree.
 *
 * Two things are checked, and both matter:
 *
 *   1. sha256(revealed serverSeed) === the hash shown before the round. Without
 *      this the server could pick a seed after seeing the bet.
 *   2. The outcome recomputes to what was recorded. Without this the commitment
 *      would be honest but the result unrelated to it.
 *
 * Everything runs on Web Crypto in the client. Nothing here asks the server
 * whether the server was fair.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(digest);
}

async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

/**
 * Mirrors `fairFloat` in `src/server/rng.ts`: 48 bits assembled from the first
 * six bytes of HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`).
 */
function floatFromDigest(digest: Uint8Array): number {
  let value = 0;
  for (let i = 0; i < 6; i += 1) value = value * 256 + digest[i];
  return value / Math.pow(256, 6);
}

/**
 * Web Crypto is async, but the payout modules take a synchronous stream — so the
 * digests are computed up front and replayed synchronously. `count` only has to
 * exceed what the game actually consumes; extra digests cost one HMAC each.
 */
export async function browserFairStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  count = 64,
): Promise<FairStream & { used: number }> {
  const floats: number[] = [];
  for (let cursor = 0; cursor < count; cursor += 1) {
    floats.push(floatFromDigest(await hmacSha256(serverSeed, `${clientSeed}:${nonce}:${cursor}`)));
  }

  let index = 0;

  // Declared as a named function rather than a method so `nextInt` can call it
  // directly — `this` is not reliable once the object is passed to game code.
  const next = (): number => {
    if (index >= floats.length) {
      throw new Error("Verification ran out of precomputed randomness.");
    }
    const value = floats[index];
    index += 1;
    return value;
  };

  return {
    next,
    nextInt: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    get used() {
      return index;
    },
  };
}

export type VerifyInput = {
  game: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  bet: number;
  /** The round's recorded result, for the comparison step. */
  recorded?: Record<string, unknown> | null;
};

export type VerifyOutput = {
  /** sha256(serverSeed) matched the hash published before the round. */
  commitmentValid: boolean;
  computedHash: string;
  /** The outcome recomputed from the seeds. */
  computed: Record<string, unknown> | null;
  /** Null when there was nothing recorded to compare against. */
  matches: boolean | null;
  /** Games whose full state cannot be recomputed from the round row alone. */
  supported: boolean;
  note?: string;
};

/**
 * Games verifiable from a single round row.
 *
 * The multi-step games (mines, last hope, mob grinder) derive their layout when
 * the session opens and then depend on the player's own choices, so a round row
 * does not carry enough to replay them. Saying so is better than implying a
 * check that is not happening.
 */
export const VERIFIABLE_GAMES = ["dice", "slots", "crash"] as const;

export async function verifyRound(input: VerifyInput): Promise<VerifyOutput> {
  const computedHash = await sha256Hex(input.serverSeed);
  const commitmentValid =
    computedHash.toLowerCase() === input.serverSeedHash.trim().toLowerCase();

  if (!(VERIFIABLE_GAMES as readonly string[]).includes(input.game)) {
    return {
      commitmentValid,
      computedHash,
      computed: null,
      matches: null,
      supported: false,
      note:
        "Tämä peli etenee useassa vaiheessa, joten yksittäinen kierrosrivi ei riitä " +
        "toistamaan sitä. Siemenen tiiviste on silti tarkistettu yllä.",
    };
  }

  const rng = await browserFairStream(input.serverSeed, input.clientSeed, input.nonce);
  let computed: Record<string, unknown>;

  switch (input.game) {
    case "dice": {
      const target = Number(input.recorded?.target ?? 50);
      const direction = (input.recorded?.direction as DiceDirection) ?? "under";
      const roll = rollDice(rng, input.bet, target, direction);
      computed = { roll: roll.roll, won: roll.won, multiplier: roll.multiplier };
      break;
    }
    case "slots": {
      const spin = spinSlots(rng, input.bet);
      computed = spin as unknown as Record<string, unknown>;
      break;
    }
    case "crash": {
      const point = crashPointFrom(rng.next());
      computed = { crashPoint: point };
      break;
    }
    default:
      computed = {};
  }

  const matches = input.recorded ? compare(computed, input.recorded) : null;

  return { commitmentValid, computedHash, computed, matches, supported: true };
}

/**
 * Compares only the fields both sides carry.
 *
 * The stored result includes presentational extras the payout function does not
 * return, so a strict deep-equal would fail on rounds that are in fact correct.
 * Floats are compared with a tolerance for the same reason.
 */
function compare(computed: Record<string, unknown>, recorded: Record<string, unknown>): boolean {
  const keys = Object.keys(computed).filter((key) => key in recorded);
  if (keys.length === 0) return false;

  return keys.every((key) => {
    const a = computed[key];
    const b = recorded[key];
    if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
    return JSON.stringify(a) === JSON.stringify(b);
  });
}
