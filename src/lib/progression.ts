/**
 * Level curve. Deliberately super-linear so levelling never becomes a coin
 * faucet that can be farmed: XP rewards are capped per action and levels grant
 * cosmetic recognition plus a small, strictly decreasing coin bonus.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  // 1 -> 2 costs 240, growth ~1.09 per level.
  return Math.round(240 * Math.pow(level - 1, 1.45));
}

export function levelFromXp(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number;
} {
  let level = 1;
  while (level < 200 && totalXp >= cumulativeXp(level + 1)) level += 1;
  const base = cumulativeXp(level);
  const next = cumulativeXp(level + 1);
  const xpIntoLevel = totalXp - base;
  const xpForNext = next - base;
  return {
    level,
    xpIntoLevel,
    xpForNext,
    progress: xpForNext > 0 ? Math.min(1, xpIntoLevel / xpForNext) : 1,
  };
}

const cumulativeCache = new Map<number, number>();

export function cumulativeXp(level: number): number {
  if (level <= 1) return 0;
  const cached = cumulativeCache.get(level);
  if (cached !== undefined) return cached;
  let total = 0;
  for (let l = 2; l <= level; l += 1) total += xpForLevel(l);
  cumulativeCache.set(level, total);
  return total;
}

/** Small, capped level-up bonus. Never scales with wager. */
export function levelUpCoinReward(level: number): number {
  return Math.min(2_000, 100 + level * 25);
}

export const XP_RULES = {
  /** Playing a round: proportional to wager but hard-capped. */
  perRound: (bet: number) => Math.min(40, 4 + Math.floor(bet / 100)),
  /** Winning adds a flat bonus — never proportional to payout. */
  winBonus: 10,
  dailyCase: 25,
  caseOpen: 8,
  battle: 45,
  achievement: 60,
} as const;

export const RANK_TITLES: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: "Kulkija" },
  { minLevel: 5, title: "Retkeilijä" },
  { minLevel: 10, title: "Kaivaja" },
  { minLevel: 18, title: "Louhija" },
  { minLevel: 27, title: "Tutkimusmatkailija" },
  { minLevel: 38, title: "Syvyyksien vartija" },
  { minLevel: 50, title: "Muinaisten tuntija" },
  { minLevel: 70, title: "Pekonin legenda" },
];

export function rankTitle(level: number): string {
  let title = RANK_TITLES[0].title;
  for (const rank of RANK_TITLES) if (level >= rank.minLevel) title = rank.title;
  return title;
}
