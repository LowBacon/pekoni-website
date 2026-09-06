import { HOUSE_EDGE } from "./config";
import type { FloatStream } from "./types";

export const MINES_TILES = 25;
export const MINES_MIN = 1;
export const MINES_MAX = 24;

function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
}

/**
 * Multiplier after `picks` safe tiles with `mines` bombs in play.
 *
 * P(surviving k picks) = C(25-m, k) / C(25, k), so the fair multiplier is its
 * reciprocal; the 1 % margin is applied on top.
 */
export function minesMultiplier(mines: number, picks: number): number {
  if (picks <= 0) return 1;
  const safe = MINES_TILES - mines;
  if (picks > safe) return 0;
  const probability = combinations(safe, picks) / combinations(MINES_TILES, picks);
  if (probability <= 0) return 0;
  return Math.floor(((1 - HOUSE_EDGE) / probability) * 10_000) / 10_000;
}

export function minesPayoutTable(mines: number): number[] {
  const safe = MINES_TILES - mines;
  return Array.from({ length: safe }, (_, i) => minesMultiplier(mines, i + 1));
}

export function validateMineCount(value: unknown): number {
  const mines = Math.trunc(Number(value));
  if (!Number.isFinite(mines) || mines < MINES_MIN || mines > MINES_MAX) {
    throw new Error(`Miinojen määrä: ${MINES_MIN}–${MINES_MAX}.`);
  }
  return mines;
}

export function validateTileIndex(value: unknown): number {
  const index = Math.trunc(Number(value));
  if (!Number.isFinite(index) || index < 0 || index >= MINES_TILES) {
    throw new Error("Virheellinen ruutu.");
  }
  return index;
}

/**
 * Bomb positions are fixed the moment the round opens and never move.
 * Fisher–Yates driven entirely by the caller's stream — on the server that is
 * the provably-fair HMAC sequence, so the layout is reproducible after the fact.
 */
export function layMines(mines: number, stream: FloatStream): number[] {
  const positions = Array.from({ length: MINES_TILES }, (_, i) => i);
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(stream.next() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions.slice(0, mines).sort((a, b) => a - b);
}

export type MinesState = {
  mines: number[];
  mineCount: number;
  revealed: number[];
};
