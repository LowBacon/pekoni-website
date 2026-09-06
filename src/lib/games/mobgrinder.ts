import type { Rarity } from "@/lib/enums";

/**
 * Mob Grinder — the overgrown forest ruin.
 *
 * A skill game, not a wager: the wave schedule is generated server-side from the
 * fair seed, every hit is validated against a wall-clock attack budget, and the
 * pot is accumulated server-side per kill. The client is a renderer.
 *
 * Economy: the reward of every spawn is normalised so that destroying the entire
 * wave set with no combo pays exactly FULL_CLEAR_MULTIPLIER × bet. Combos add on
 * top, and the whole round is hard-capped at MAX_PAYOUT_MULTIPLIER × bet, so no
 * amount of automation can turn the grinder into a coin faucet.
 */

export const ROUND_DURATION_MS = 50_000;
export const FULL_CLEAR_MULTIPLIER = 1.45;
export const MAX_PAYOUT_MULTIPLIER = 3.5;

export const PLAYER_DAMAGE = 10;
export const CRIT_CHANCE = 0.15;
export const CRIT_MULTIPLIER = 2.5;

/** Human-achievable click rate, plus a small burst allowance for latency. */
export const MAX_HITS_PER_SECOND = 8;
export const HIT_BURST = 6;

export type MobKind = {
  key: string;
  name: string;
  hp: number;
  base: number;
  rarity: Rarity;
  ability: string;
  lifetimeMs: number;
};

export const MOB_KINDS: MobKind[] = [
  { key: "zombie", name: "Zombie", hp: 30, base: 8, rarity: "COMMON", ability: "Hidas mutta sitkeä", lifetimeMs: 9_000 },
  { key: "spider", name: "Spider", hp: 35, base: 10, rarity: "COMMON", ability: "Liikkuu nopeasti", lifetimeMs: 7_000 },
  { key: "skeleton", name: "Skeleton", hp: 40, base: 12, rarity: "COMMON", ability: "Ampuu kaukaa", lifetimeMs: 8_000 },
  { key: "creeper", name: "Creeper", hp: 60, base: 25, rarity: "UNCOMMON", ability: "Räjähtää ajastimella", lifetimeMs: 6_000 },
  { key: "enderman", name: "Enderman", hp: 90, base: 45, rarity: "RARE", ability: "Teleporttaa osuman jälkeen", lifetimeMs: 6_500 },
  { key: "witch", name: "Witch", hp: 110, base: 60, rarity: "RARE", ability: "Parantaa itseään", lifetimeMs: 7_500 },
  { key: "armored_zombie", name: "Armored Zombie", hp: 200, base: 90, rarity: "EPIC", ability: "Panssari vaimentaa osumia", lifetimeMs: 10_000 },
  { key: "ancient_skeleton", name: "Ancient Skeleton", hp: 260, base: 130, rarity: "EPIC", ability: "Muinainen jousi", lifetimeMs: 10_000 },
  { key: "charged_creeper", name: "Charged Creeper", hp: 320, base: 250, rarity: "LEGENDARY", ability: "Salamoiva räjähdys", lifetimeMs: 8_000 },
  { key: "corrupted_enderman", name: "Corrupted Enderman", hp: 420, base: 400, rarity: "MYTHIC", ability: "Turmeltunut portaali", lifetimeMs: 9_000 },
];

export const MOB_BY_KEY = new Map(MOB_KINDS.map((mob) => [mob.key, mob]));

export const COMBO_TIERS = [
  { combo: 5, multiplier: 1.15, label: "5x" },
  { combo: 10, multiplier: 1.3, label: "10x" },
  { combo: 20, multiplier: 1.6, label: "20x" },
  { combo: 50, multiplier: 2.2, label: "50x" },
];

export const COMBO_WINDOW_MS = 2_600;

export function comboMultiplier(combo: number): number {
  let multiplier = 1;
  for (const tier of COMBO_TIERS) if (combo >= tier.combo) multiplier = tier.multiplier;
  return multiplier;
}

/** Weighted spawn table per wave — later waves lean rarer and hit harder. */
const WAVE_TABLE: { weights: Record<string, number>; count: number }[] = [
  { count: 7, weights: { zombie: 50, spider: 30, skeleton: 20 } },
  { count: 8, weights: { zombie: 35, spider: 25, skeleton: 25, creeper: 15 } },
  { count: 9, weights: { zombie: 22, spider: 20, skeleton: 24, creeper: 22, enderman: 12 } },
  { count: 9, weights: { skeleton: 20, creeper: 24, enderman: 20, witch: 18, armored_zombie: 12, charged_creeper: 6 } },
  { count: 10, weights: { creeper: 18, enderman: 20, witch: 20, armored_zombie: 18, ancient_skeleton: 14, charged_creeper: 8, corrupted_enderman: 2 } },
  { count: 10, weights: { enderman: 16, witch: 18, armored_zombie: 20, ancient_skeleton: 20, charged_creeper: 18, corrupted_enderman: 8 } },
];

export type Spawn = {
  id: number;
  kind: string;
  hp: number;
  maxHp: number;
  reward: number;
  spawnAt: number;
  despawnAt: number;
  wave: number;
  /** Normalised 0–1 arena coordinates, so the client can lay the ruin out. */
  x: number;
  y: number;
};

function pickWeighted(weights: Record<string, number>, roll: number): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let ticket = roll * total;
  for (const [key, weight] of entries) {
    ticket -= weight;
    if (ticket < 0) return key;
  }
  return entries[entries.length - 1][0];
}

/**
 * Builds the full round. Rewards are normalised against the bet so that the
 * economy is independent of which mobs happened to roll.
 */
export function buildWaves(stream: { next(): number }, bet: number): Spawn[] {
  const spawns: Spawn[] = [];
  const waveDuration = ROUND_DURATION_MS / WAVE_TABLE.length;
  let id = 0;

  WAVE_TABLE.forEach((wave, waveIndex) => {
    const waveStart = waveIndex * waveDuration;
    for (let i = 0; i < wave.count; i += 1) {
      const kindKey = pickWeighted(wave.weights, stream.next());
      const kind = MOB_BY_KEY.get(kindKey)!;
      const jitter = stream.next();
      const spawnAt = Math.round(waveStart + (i / wave.count) * waveDuration + jitter * 600);
      spawns.push({
        id: id++,
        kind: kind.key,
        hp: kind.hp,
        maxHp: kind.hp,
        reward: kind.base,
        spawnAt,
        despawnAt: spawnAt + kind.lifetimeMs,
        wave: waveIndex + 1,
        x: 0.08 + stream.next() * 0.84,
        y: 0.18 + stream.next() * 0.66,
      });
    }
  });

  const totalBase = spawns.reduce((sum, spawn) => sum + spawn.reward, 0);
  const pot = bet * FULL_CLEAR_MULTIPLIER;
  for (const spawn of spawns) {
    spawn.reward = Math.max(1, Math.round((spawn.reward / totalBase) * pot));
  }

  return spawns;
}

export type GrinderState = {
  spawns: Spawn[];
  pot: number;
  kills: number;
  combo: number;
  bestCombo: number;
  lastKillAt: number;
  hitBudget: number;
  lastTickAt: number;
  hitCounter: number;
  startedAt: number;
};

/** Refills the wall-clock attack budget. Prevents scripted click storms. */
export function refillBudget(state: GrinderState, now: number): void {
  const elapsed = Math.max(0, now - state.lastTickAt);
  state.hitBudget = Math.min(
    HIT_BURST,
    state.hitBudget + (elapsed / 1000) * MAX_HITS_PER_SECOND,
  );
  state.lastTickAt = now;
}

export function maxPayout(bet: number): number {
  return Math.floor(bet * MAX_PAYOUT_MULTIPLIER);
}
