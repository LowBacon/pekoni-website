import { HOUSE_EDGE } from "./config";

/**
 * Crash — the mountain ascent.
 *
 * The crash point is fixed at bet time from the provably-fair stream and is
 * never sent to the client until the round ends. The client animates the curve
 * from the shared `startedAt` timestamp; the authoritative multiplier is always
 * recomputed on the server from its own clock.
 *
 * P(crash >= m) = 0.99 / m, so cashing out at any m has an expected value of
 * exactly 0.99 — a flat 1 % margin, matching every other Pekoni game.
 */

export const CRASH_GROWTH_PER_SECOND = 0.13;
export const CRASH_MAX_MULTIPLIER = 10_000;

/** Small allowance so a player is not punished for their network latency. */
export const CASHOUT_GRACE_MS = 120;

export function crashPointFrom(roll: number): number {
  const clamped = Math.min(0.999_999_999, Math.max(0, roll));
  const raw = (1 - HOUSE_EDGE) / (1 - clamped);
  const floored = Math.floor(raw * 100) / 100;
  return Math.min(CRASH_MAX_MULTIPLIER, Math.max(1, floored));
}

export function multiplierAt(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs) / 1000;
  const value = Math.exp(seconds * CRASH_GROWTH_PER_SECOND);
  return Math.floor(value * 100) / 100;
}

export function timeToReach(multiplier: number): number {
  if (multiplier <= 1) return 0;
  return (Math.log(multiplier) / CRASH_GROWTH_PER_SECOND) * 1000;
}

export function validateAutoCashout(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Math.floor(Number(value) * 100) / 100;
  if (!Number.isFinite(num) || num < 1.01 || num > CRASH_MAX_MULTIPLIER) {
    throw new Error("Automaattinen lunastus: 1.01x – 10000x.");
  }
  return num;
}

export type CrashState = {
  crashPoint: number;
  autoCashout: number | null;
  startedAt: number;
};

/**
 * Resolves a manual cash-out request against the server clock.
 * Returns null when the ascent had already ended.
 */
export function resolveCashout(
  state: CrashState,
  now: number,
): { multiplier: number; busted: boolean } {
  const elapsed = now - state.startedAt - CASHOUT_GRACE_MS;
  const reached = multiplierAt(elapsed);

  if (reached >= state.crashPoint) {
    return { multiplier: state.crashPoint, busted: true };
  }
  return { multiplier: Math.max(1, reached), busted: false };
}
