import { BATTLE_MODES, type BattleMode } from "./enums";

/**
 * Case-battle rules and timing.
 *
 * Pure and shared: the server settles battles with these constants, the client
 * animates against them, and the static build replays them locally. One
 * definition means the reveal clock cannot drift between the three.
 */

export const ROUND_REVEAL_MS = 4_200;
export const BATTLE_COUNTDOWN_MS = 1_800;
export const MAX_ROUNDS = 6;
export const ALLOWED_SLOTS = [2, 3, 4] as const;

export const BOT_NAMES = [
  "Kaivosmestari",
  "Sumun Vartija",
  "Petra",
  "Routa",
  "Kuusimetsä",
  "Ukkonen",
  "Hiiliparta",
  "Lumikko",
];

export function battleTimings(rounds: number, startsAt: Date | number | null) {
  if (startsAt === null) return { startsAt: null, finishesAt: null };
  const start = typeof startsAt === "number" ? startsAt : startsAt.getTime();
  return {
    startsAt: start,
    finishesAt: start + rounds * ROUND_REVEAL_MS,
  };
}

/** How many rounds the shared clock has released by `now`. */
export function revealedRounds(
  rounds: number,
  startsAt: Date | number | null,
  now = Date.now(),
): number {
  if (startsAt === null) return 0;
  const start = typeof startsAt === "number" ? startsAt : startsAt.getTime();
  const elapsed = now - start;
  if (elapsed < 0) return 0;
  return Math.min(rounds, Math.floor(elapsed / ROUND_REVEAL_MS) + 1);
}

export function validateBattleInput(input: {
  rounds: unknown;
  slots: unknown;
  mode: unknown;
  bots?: unknown;
}) {
  const rounds = Math.trunc(Number(input.rounds));
  if (!Number.isFinite(rounds) || rounds < 1 || rounds > MAX_ROUNDS) {
    throw new Error(`Kierroksia voi olla 1–${MAX_ROUNDS}.`);
  }
  const slots = Math.trunc(Number(input.slots));
  if (!ALLOWED_SLOTS.includes(slots as (typeof ALLOWED_SLOTS)[number])) {
    throw new Error("Pelaajamäärä: 2, 3 tai 4.");
  }
  const mode = String(input.mode) as BattleMode;
  if (!BATTLE_MODES.includes(mode)) throw new Error("Virheellinen pelimuoto.");
  if (mode === "TEAM" && slots % 2 !== 0) {
    throw new Error("Team Battle vaatii parillisen pelaajamäärän.");
  }
  const bots = Math.trunc(Number(input.bots ?? 0));
  if (!Number.isFinite(bots) || bots < 0 || bots > slots - 1) {
    throw new Error("Bottien määrä on virheellinen.");
  }
  return { rounds, slots, mode, bots };
}
