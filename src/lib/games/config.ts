import type { GameKey } from "@/lib/enums";

export const BET_LIMITS = {
  min: 10,
  max: 100_000,
} as const;

/**
 * Retained margin. Every game's expected value is computed from this single
 * constant so payouts stay consistent across the platform.
 */
export const HOUSE_EDGE = 0.01;

export const QUICK_BETS = [10, 50, 100, 500] as const;

export type GameMeta = {
  key: GameKey | "cases" | "battles";
  name: string;
  tagline: string;
  href: string;
  theme: string;
  category: "originals" | "pekoni" | "cases";
  tags: string[];
  minBet: number;
  maxBet: number;
};

export const GAME_CATALOG: GameMeta[] = [
  {
    key: "slots",
    name: "Slots",
    tagline: "Muinainen louhintakone syvällä kalliossa.",
    href: "/games/slots",
    theme: "mine",
    category: "originals",
    tags: ["MineBet", "Popular"],
    minBet: BET_LIMITS.min,
    maxBet: 10_000,
  },
  {
    key: "dice",
    name: "Dice",
    tagline: "Todennäköisyyden alttari. Valitse rajasi.",
    href: "/games/dice",
    theme: "altar",
    category: "originals",
    tags: ["MineBet", "Popular"],
    minBet: BET_LIMITS.min,
    maxBet: BET_LIMITS.max,
  },
  {
    key: "crash",
    name: "Crash",
    tagline: "Nouse vuorelle ja lunasta ennen putoamista.",
    href: "/games/crash",
    theme: "mountain",
    category: "originals",
    tags: ["MineBet", "Popular"],
    minBet: BET_LIMITS.min,
    maxBet: 50_000,
  },
  {
    key: "mines",
    name: "Mines",
    tagline: "Kristallikaivos. Kaiva niin pitkälle kuin uskallat.",
    href: "/games/mines",
    theme: "cavern",
    category: "originals",
    tags: ["MineBet"],
    minBet: BET_LIMITS.min,
    maxBet: 25_000,
  },
  {
    key: "mobgrinder",
    name: "Mob Grinder",
    tagline: "Metsän uumenissa uinuva raunio herää.",
    href: "/games/mobgrinder",
    theme: "ruins",
    category: "pekoni",
    tags: ["Arcade", "New"],
    minBet: BET_LIMITS.min,
    maxBet: 5_000,
  },
  {
    key: "lasthope",
    name: "Last Hope",
    tagline: "Myrskyn pyyhkimä vuoripyhäkkö odottaa.",
    href: "/games/last-hope",
    theme: "shrine",
    category: "pekoni",
    tags: ["Arcade", "New"],
    minBet: BET_LIMITS.min,
    maxBet: 25_000,
  },
  {
    key: "cases",
    name: "Caser",
    tagline: "Tutkimusmatkailijan holvi ja sen aarteet.",
    href: "/caser",
    theme: "vault",
    category: "cases",
    tags: ["Cases", "Popular"],
    minBet: 0,
    maxBet: 0,
  },
  {
    key: "battles",
    name: "Case Battles",
    tagline: "Avaa caset vastakkain — voittaja vie potin.",
    href: "/battles",
    theme: "arena",
    category: "cases",
    tags: ["Cases", "Multiplayer"],
    minBet: 0,
    maxBet: 0,
  },
  /* ---------------------------------------------------------- arcade ----
     Five short-round games sharing one settlement endpoint
     (`/api/games/arcade`). Their rules and odds live in `src/lib/games/arcade.ts`
     and are shown verbatim in each game's rules panel, so the number a player
     reads is the number the server used. */
  {
    key: "coinflip",
    name: "Coinflip",
    tagline: "Yksi heitto, 50 %. Selkein veto koko verkossa.",
    href: "/games/coinflip",
    theme: "altar",
    category: "originals",
    tags: ["Arcade", "Fast"],
    minBet: BET_LIMITS.min,
    maxBet: 10_000,
  },
  {
    key: "wheel",
    name: "Wheel",
    tagline: "Kahdeksan yhtä todennäköistä lohkoa. Osoitin ratkaisee.",
    href: "/games/wheel",
    theme: "arena",
    category: "originals",
    tags: ["Arcade"],
    minBet: BET_LIMITS.min,
    maxBet: 10_000,
  },
  {
    key: "plinko",
    name: "Plinko",
    tagline: "Kahdeksan kolikonheittoa, binomijakauma, näkyvät todennäköisyydet.",
    href: "/games/plinko",
    theme: "mine",
    category: "originals",
    tags: ["Arcade", "Popular"],
    minBet: BET_LIMITS.min,
    maxBet: 10_000,
  },
  {
    key: "tower",
    name: "Tower",
    tagline: "Kiipeä kerros kerrallaan. Nosta voitot ennen ansaa.",
    href: "/games/tower",
    theme: "mine",
    category: "originals",
    tags: ["Arcade", "Cashout"],
    minBet: BET_LIMITS.min,
    maxBet: 10_000,
  },
  {
    key: "hilo",
    name: "Hi-Lo",
    tagline: "Korkeampi vai matalampi. Tasapeli häviää — ja se sanotaan ääneen.",
    href: "/games/hilo",
    theme: "library",
    category: "originals",
    tags: ["Arcade", "Cashout"],
    minBet: BET_LIMITS.min,
    maxBet: 10_000,
  },
];

export function gameMeta(key: string): GameMeta | undefined {
  return GAME_CATALOG.find((game) => game.key === key);
}

export function assertBet(bet: number, key: GameKey): number {
  const meta = gameMeta(key);
  const min = meta?.minBet ?? BET_LIMITS.min;
  const max = meta?.maxBet ?? BET_LIMITS.max;
  const value = Math.trunc(Number(bet));
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Panoksen tulee olla ${min}–${max} coins.`);
  }
  return value;
}

/** Wagering more than this share of the balance asks for a second confirmation. */
export const LARGE_WAGER_RATIO = 0.5;
