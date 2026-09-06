// String-backed enums. Kept in TypeScript rather than as native database enums
// so the Prisma schema stays portable between SQLite and PostgreSQL.

export const ROLES = ["USER", "MODERATOR", "ADMIN", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

/** Higher number == more authority. Used for every server-side permission check. */
export const ROLE_RANK: Record<Role, number> = {
  USER: 0,
  MODERATOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasRole(role: string, atLeast: Role): boolean {
  const rank = ROLE_RANK[role as Role];
  if (rank === undefined) return false;
  return rank >= ROLE_RANK[atLeast];
}

export const TRANSACTION_TYPES = [
  "GAME_BET",
  "GAME_WIN",
  "CASE_PURCHASE",
  "CASE_REWARD",
  "DAILY_REWARD",
  "BATTLE_ENTRY",
  "BATTLE_WIN",
  "ADMIN_ADJUSTMENT",
  "SOCIAL_REWARD",
  "TRANSFER_OUT",
  "TRANSFER_REFUND",
  "SIGNUP_BONUS",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_LABELS: Record<TransactionType, string> = {
  GAME_BET: "Panos",
  GAME_WIN: "Voitto",
  CASE_PURCHASE: "Case ostettu",
  CASE_REWARD: "Case-palkinto",
  DAILY_REWARD: "Päivittäinen palkinto",
  BATTLE_ENTRY: "Battle-osallistuminen",
  BATTLE_WIN: "Battle-voitto",
  ADMIN_ADJUSTMENT: "Ylläpidon muutos",
  SOCIAL_REWARD: "Yhteisöpalkinto",
  TRANSFER_OUT: "Siirto palvelimelle",
  TRANSFER_REFUND: "Siirron palautus",
  SIGNUP_BONUS: "Aloituspalkkio",
};

/** Which side of the ledger a type falls on, for filters and receipts. */
export const CREDIT_TRANSACTION_TYPES = new Set<TransactionType>([
  "GAME_WIN",
  "CASE_REWARD",
  "DAILY_REWARD",
  "BATTLE_WIN",
  "SOCIAL_REWARD",
  "TRANSFER_REFUND",
  "SIGNUP_BONUS",
]);

export const TRANSFER_STATUSES = ["PENDING", "CLAIMED", "COMPLETED", "FAILED"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSFER_STATUS_META: Record<
  TransferStatus,
  { label: string; tone: "amber" | "cyan" | "emerald" | "danger"; description: string }
> = {
  PENDING: {
    label: "Odottaa",
    tone: "amber",
    description: "Coinit on veloitettu ja varattu. Palvelin ei ole vielä noutanut siirtoa.",
  },
  CLAIMED: {
    label: "Toimitetaan",
    tone: "cyan",
    description: "Palvelin on noutanut siirron ja hyvittää coinit peliin.",
  },
  COMPLETED: {
    label: "Valmis",
    tone: "emerald",
    description: "Coinit on hyvitetty Minecraft-tilillesi.",
  },
  FAILED: {
    label: "Epäonnistui",
    tone: "danger",
    description: "Siirto ei mennyt läpi. Coinit on palautettu saldollesi.",
  },
};

export const RARITIES = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "EPIC",
  "LEGENDARY",
  "MYTHIC",
] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_META: Record<
  Rarity,
  { label: string; color: string; glow: string; rank: number }
> = {
  COMMON: { label: "Common", color: "var(--rarity-common)", glow: "var(--rarity-common-glow)", rank: 0 },
  UNCOMMON: { label: "Uncommon", color: "var(--rarity-uncommon)", glow: "var(--rarity-uncommon-glow)", rank: 1 },
  RARE: { label: "Rare", color: "var(--rarity-rare)", glow: "var(--rarity-rare-glow)", rank: 2 },
  EPIC: { label: "Epic", color: "var(--rarity-epic)", glow: "var(--rarity-epic-glow)", rank: 3 },
  LEGENDARY: { label: "Legendary", color: "var(--rarity-legendary)", glow: "var(--rarity-legendary-glow)", rank: 4 },
  MYTHIC: { label: "Mythic", color: "var(--rarity-mythic)", glow: "var(--rarity-mythic-glow)", rank: 5 },
};

export const GAMES = [
  "dice",
  "crash",
  "mines",
  "slots",
  "mobgrinder",
  "lasthope", "coinflip", "plinko", "wheel", "tower", "hilo",
] as const;
export type GameKey = (typeof GAMES)[number];

export const BATTLE_MODES = ["CLASSIC", "TEAM", "CRAZY"] as const;
export type BattleMode = (typeof BATTLE_MODES)[number];

export const BATTLE_MODE_META: Record<
  BattleMode,
  { label: string; description: string }
> = {
  CLASSIC: {
    label: "Classic",
    description: "Suurin yhteisarvo voittaa koko potin.",
  },
  TEAM: {
    label: "Team Battle",
    description: "Kaksi joukkuetta, yhteenlasketut arvot ratkaisevat.",
  },
  CRAZY: {
    label: "Crazy Mode",
    description: "Käänteinen sääntö — pienin yhteisarvo voittaa.",
  },
};

export const ACTIVITY_KINDS = [
  "GAME_WIN",
  "CASE_OPEN",
  "BATTLE_WIN",
  "LEVEL_UP",
  "ACHIEVEMENT",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

