/**
 * The browser-local world used by the static (GitHub Pages) build.
 *
 * GitHub Pages serves files; it cannot run a server, a database or a session.
 * So in that build the same `/api/*` calls are answered here, against a store
 * that lives in this one browser's `localStorage`.
 *
 * What this is NOT: the security model. The full deployment keeps every coin,
 * every roll and every permission on the server, which is the only place those
 * guarantees can hold. Here the player owns the storage, so the demo is honest
 * about it rather than pretending otherwise — the UI shows a demo banner and
 * `provablyFair` is replaced by `crypto.getRandomValues`.
 */

import { levelFromXp } from "@/lib/progression";
import type { FairStream } from "@/lib/games/types";
import {
  ACHIEVEMENT_SPECS,
  buildCaseItems,
  CASE_SPECS,
  DAILY_CASE_SPEC,
} from "@/lib/content/world";

export const STORAGE_KEY = "pekoni.demo.v2";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type DemoStats = {
  gamesPlayed: number;
  totalWagered: number;
  totalWon: number;
  biggestWin: number;
  winStreak: number;
  bestWinStreak: number;
  highestCrash: number;
  bestMinesMult: number;
  casesOpened: number;
  battlesPlayed: number;
  battlesWon: number;
  mobsDefeated: number;
  bestCombo: number;
};

export type DemoUser = {
  id: string;
  username: string;
  usernameLower: string;
  email: string | null;
  passwordHash: string | null;
  salt: string | null;
  role: "USER" | "MODERATOR" | "ADMIN" | "OWNER";
  status: "ACTIVE" | "SUSPENDED";
  minecraftUsername: string | null;
  xp: number;
  balance: number;
  soundEnabled: boolean;
  reducedMotion: boolean;
  publicActivity: boolean;
  clientSeed: string;
  serverSeedHash: string;
  nonce: number;
  createdAt: string;
  lastSeenAt: string;
  /** Seeded neighbours that populate the leaderboard. They cannot sign in. */
  demo: boolean;
  stats: DemoStats;
};

export type DemoTransaction = {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  source: string;
  createdAt: string;
};

export type DemoRound = {
  id: string;
  userId: string;
  game: string;
  bet: number;
  payout: number;
  multiplier: number;
  outcome: "WIN" | "LOSS" | "PUSH";
  createdAt: string;
};

export type DemoCaseItem = {
  id: string;
  name: string;
  rarity: string;
  icon: string;
  value: number;
  weight: number;
};

export type DemoCase = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  theme: string;
  kind: string;
  sortOrder: number;
  items: DemoCaseItem[];
};

export type DemoOpening = {
  id: string;
  userId: string;
  caseId: string;
  caseName: string;
  theme: string;
  item: { name: string; rarity: string; icon: string; value: number };
  cost: number;
  value: number;
  source: string;
  createdAt: string;
};

export type DemoBattleParticipant = {
  id: string;
  slot: number;
  team: number;
  userId: string | null;
  botName: string | null;
  username: string;
  minecraftUsername: string | null;
  total: number;
  payout: number;
  isWinner: boolean;
};

export type DemoBattle = {
  id: string;
  caseId: string;
  creatorId: string;
  creator: string;
  mode: string;
  rounds: number;
  slots: number;
  entryCost: number;
  prizePool: number;
  status: "WAITING" | "RUNNING" | "FINISHED" | "CANCELLED";
  startsAt: number | null;
  createdAt: string;
  finishedAt: string | null;
  participants: DemoBattleParticipant[];
  draws: {
    roundNumber: number;
    participantId: string;
    item: { id: string; name: string; rarity: string; icon: string; value: number };
  }[];
};

export type DemoActivity = {
  id: string;
  userId: string;
  kind: string;
  username: string;
  minecraftUsername: string | null;
  label: string;
  amount: number | null;
  rarity: string | null;
  createdAt: string;
};

export type DemoNotification = {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type DemoAchievement = {
  userId: string;
  slug: string;
  progress: number;
  unlockedAt: string | null;
};

export type DemoDaily = {
  id: string;
  userId: string;
  amount: number;
  streak: number;
  itemName: string | null;
  rarity: string | null;
  claimedAt: string;
};

export type DemoGameSession = {
  id: string;
  userId: string;
  game: string;
  status: "ACTIVE" | "CASHED_OUT" | "BUSTED" | "EXPIRED";
  bet: number;
  state: string;
  startedAt: number;
  expiresAt: number;
};

export type DemoAudit = {
  id: string;
  action: string;
  summary: string;
  actor: string;
  target: string | null;
  createdAt: string;
};

export type DemoDb = {
  version: 2;
  sessionUserId: string | null;
  users: DemoUser[];
  cases: DemoCase[];
  transactions: DemoTransaction[];
  rounds: DemoRound[];
  openings: DemoOpening[];
  battles: DemoBattle[];
  activity: DemoActivity[];
  notifications: DemoNotification[];
  achievements: DemoAchievement[];
  daily: DemoDaily[];
  sessions: DemoGameSession[];
  audit: DemoAudit[];
};

/* -------------------------------------------------------------------------- */
/* Randomness                                                                 */
/* -------------------------------------------------------------------------- */

/** Cryptographically strong floats in [0, 1). */
export function randomFloat(): number {
  const buffer = new Uint32Array(2);
  crypto.getRandomValues(buffer);
  // 53 bits of entropy, the full precision of a double.
  return (buffer[0] * 2 ** 21 + (buffer[1] >>> 11)) / 2 ** 53;
}

/** Matches the server's FairStream shape so the pure game modules can consume it. */
export function randomStream(): FairStream {
  return {
    next: randomFloat,
    nextInt: (min: number, max: number) => min + Math.floor(randomFloat() * (max - min + 1)),
  };
}

export function randomId(prefix = "d"): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("")}`;
}

export function randomHex(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function weightedPick<T extends { weight: number }>(items: T[], roll: number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let ticket = roll * total;
  for (const item of items) {
    ticket -= item.weight;
    if (ticket < 0) return item;
  }
  return items[items.length - 1];
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

let cache: DemoDb | null = null;

export function emptyStats(): DemoStats {
  return {
    gamesPlayed: 0,
    totalWagered: 0,
    totalWon: 0,
    biggestWin: 0,
    winStreak: 0,
    bestWinStreak: 0,
    highestCrash: 0,
    bestMinesMult: 0,
    casesOpened: 0,
    battlesPlayed: 0,
    battlesWon: 0,
    mobsDefeated: 0,
    bestCombo: 0,
  };
}

/** Neighbours so the Hall of Legends is not an empty room on first visit. */
const DEMO_ROSTER: { username: string; balance: number; xp: number; stats: Partial<DemoStats> }[] = [
  {
    username: "Elzuu1",
    balance: 48_200,
    xp: 39_000,
    stats: { gamesPlayed: 412, totalWagered: 186_000, totalWon: 191_400, biggestWin: 24_000, battlesWon: 9, casesOpened: 61, highestCrash: 18.4 },
  },
  {
    username: "Routavuori",
    balance: 31_450,
    xp: 26_400,
    stats: { gamesPlayed: 298, totalWagered: 121_000, totalWon: 118_900, biggestWin: 12_800, battlesWon: 6, casesOpened: 40, bestMinesMult: 9.2 },
  },
  {
    username: "Sumuparta",
    balance: 22_900,
    xp: 18_700,
    stats: { gamesPlayed: 221, totalWagered: 88_500, totalWon: 86_100, biggestWin: 9_600, battlesWon: 4, casesOpened: 28 },
  },
  {
    username: "Kuusikko",
    balance: 15_300,
    xp: 12_100,
    stats: { gamesPlayed: 164, totalWagered: 52_000, totalWon: 50_400, biggestWin: 7_400, battlesWon: 2, casesOpened: 19 },
  },
  {
    username: "Lumikko",
    balance: 9_800,
    xp: 8_400,
    stats: { gamesPlayed: 118, totalWagered: 33_800, totalWon: 32_100, biggestWin: 5_100, battlesWon: 1, casesOpened: 12 },
  },
  {
    username: "Hiiliparta",
    balance: 6_450,
    xp: 5_200,
    stats: { gamesPlayed: 76, totalWagered: 19_400, totalWon: 18_200, biggestWin: 3_200, casesOpened: 7 },
  },
  {
    username: "Petra",
    balance: 3_120,
    xp: 2_600,
    stats: { gamesPlayed: 41, totalWagered: 9_800, totalWon: 9_100, biggestWin: 1_900, casesOpened: 3 },
  },
];

const DEMO_ACTIVITY: { username: string; kind: string; label: string; amount: number | null; rarity: string | null; minutesAgo: number }[] = [
  { username: "Elzuu1", kind: "GAME_WIN", label: "voitti 2 400 coins Crashissa.", amount: 2_400, rarity: null, minutesAgo: 6 },
  { username: "Routavuori", kind: "CASE_OPEN", label: "avasi Legendary Casen.", amount: 45_000, rarity: "LEGENDARY", minutesAgo: 19 },
  { username: "Sumuparta", kind: "LEVEL_UP", label: "saavutti Level 30.", amount: null, rarity: null, minutesAgo: 42 },
  { username: "Kuusikko", kind: "BATTLE_WIN", label: "voitti case battlen.", amount: 3_000, rarity: null, minutesAgo: 74 },
  { username: "Lumikko", kind: "ACHIEVEMENT", label: "avasi saavutuksen Case Collector.", amount: null, rarity: null, minutesAgo: 130 },
  { username: "Petra", kind: "GAME_WIN", label: "voitti 860 coins Minesissä.", amount: 860, rarity: null, minutesAgo: 190 },
];

function seedDb(): DemoDb {
  const now = Date.now();

  const cases: DemoCase[] = [...CASE_SPECS, DAILY_CASE_SPEC].map((spec, index) => ({
    id: `case_${spec.slug}`,
    slug: spec.slug,
    name: spec.name,
    tagline: spec.tagline,
    description: spec.description,
    price: spec.price,
    theme: spec.theme,
    kind: spec.kind ?? "STANDARD",
    sortOrder: spec.kind === "DAILY" ? 100 : index,
    items: buildCaseItems(spec).map((item, itemIndex) => ({
      id: `item_${spec.slug}_${itemIndex}`,
      name: item.name,
      rarity: item.rarity,
      icon: item.icon,
      value: item.value,
      weight: item.weight,
    })),
  }));

  const users: DemoUser[] = DEMO_ROSTER.map((entry, index) => ({
    id: `demo_${entry.username.toLowerCase()}`,
    username: entry.username,
    usernameLower: entry.username.toLowerCase(),
    email: null,
    passwordHash: null,
    salt: null,
    role: "USER",
    status: "ACTIVE",
    minecraftUsername: entry.username,
    xp: entry.xp,
    balance: entry.balance,
    soundEnabled: false,
    reducedMotion: false,
    publicActivity: true,
    clientSeed: randomHex(8),
    serverSeedHash: randomHex(32),
    nonce: entry.stats.gamesPlayed ?? 0,
    createdAt: new Date(now - (30 + index * 9) * 24 * 60 * 60 * 1000).toISOString(),
    lastSeenAt: new Date(now - index * 37 * 60 * 1000).toISOString(),
    demo: true,
    stats: { ...emptyStats(), ...entry.stats },
  }));

  const byName = new Map(users.map((user) => [user.username, user]));

  const activity: DemoActivity[] = DEMO_ACTIVITY.map((entry) => {
    const user = byName.get(entry.username);
    return {
      id: randomId("act"),
      userId: user?.id ?? "demo",
      kind: entry.kind,
      username: entry.username,
      minecraftUsername: user?.minecraftUsername ?? entry.username,
      label: entry.label,
      amount: entry.amount,
      rarity: entry.rarity,
      createdAt: new Date(now - entry.minutesAgo * 60 * 1000).toISOString(),
    };
  });

  return {
    version: 2,
    sessionUserId: null,
    users,
    cases,
    transactions: [],
    rounds: [],
    openings: [],
    battles: [],
    activity,
    notifications: [],
    achievements: [],
    daily: [],
    sessions: [],
    audit: [],
  };
}

export function loadDb(): DemoDb {
  if (cache) return cache;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoDb;
      if (parsed.version === 2) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    /* corrupt or unavailable storage — start from a fresh world */
  }

  cache = seedDb();
  saveDb();
  return cache;
}

export function saveDb(): void {
  if (!cache) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* quota or private mode — the session still works, it just will not persist */
  }
}

/** Mutates the store and persists in one step. */
export function mutate<T>(fn: (db: DemoDb) => T): T {
  const db = loadDb();
  const result = fn(db);
  saveDb();
  return result;
}

export function resetDb(): void {
  cache = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/* -------------------------------------------------------------------------- */
/* Domain helpers                                                             */
/* -------------------------------------------------------------------------- */

export class DemoError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function currentUser(db: DemoDb): DemoUser | null {
  if (!db.sessionUserId) return null;
  return db.users.find((user) => user.id === db.sessionUserId) ?? null;
}

export function requireUser(db: DemoDb): DemoUser {
  const user = currentUser(db);
  if (!user) throw new DemoError("Kirjaudu sisään jatkaaksesi.", 401);
  if (user.status === "SUSPENDED") throw new DemoError("Tili on jäädytetty.", 403);
  return user;
}

/**
 * The demo's ledger. Every balance change goes through here, exactly as every
 * balance change on the server goes through one transactional writer.
 */
export function ledger(
  db: DemoDb,
  user: DemoUser,
  entry: { type: string; amount: number; source: string },
): number {
  const signed = entry.type.endsWith("_BET") || entry.type.endsWith("_PURCHASE") || entry.type.endsWith("_ENTRY")
    ? -Math.abs(entry.amount)
    : entry.amount;

  const before = user.balance;
  const after = before + signed;
  if (after < 0) throw new DemoError("Coinit eivät riitä.", 400, "INSUFFICIENT_FUNDS");

  user.balance = after;
  db.transactions.unshift({
    id: randomId("tx"),
    userId: user.id,
    type: entry.type,
    amount: signed,
    balanceBefore: before,
    balanceAfter: after,
    source: entry.source,
    createdAt: new Date().toISOString(),
  });
  if (db.transactions.length > 400) db.transactions.length = 400;
  return after;
}

export function pushActivity(
  db: DemoDb,
  user: DemoUser,
  entry: { kind: string; label: string; amount?: number | null; rarity?: string | null },
): void {
  if (!user.publicActivity) return;
  db.activity.unshift({
    id: randomId("act"),
    userId: user.id,
    kind: entry.kind,
    username: user.username,
    minecraftUsername: user.minecraftUsername,
    label: entry.label,
    amount: entry.amount ?? null,
    rarity: entry.rarity ?? null,
    createdAt: new Date().toISOString(),
  });
  if (db.activity.length > 80) db.activity.length = 80;
}

export function notify(
  db: DemoDb,
  user: DemoUser,
  entry: { kind: string; title: string; body?: string | null; href?: string | null },
): void {
  db.notifications.unshift({
    id: randomId("ntf"),
    userId: user.id,
    kind: entry.kind,
    title: entry.title,
    body: entry.body ?? null,
    href: entry.href ?? null,
    readAt: null,
    createdAt: new Date().toISOString(),
  });
  if (db.notifications.length > 60) db.notifications.length = 60;
}

export function awardXp(db: DemoDb, user: DemoUser, amount: number) {
  const before = levelFromXp(user.xp).level;
  user.xp += Math.max(0, Math.trunc(amount));
  const after = levelFromXp(user.xp).level;
  const leveledUp = after > before;

  if (leveledUp) {
    // Small, strictly capped bonus — never proportional to what was wagered.
    const reward = Math.min(2_000, 100 + after * 25);
    ledger(db, user, { type: "ADMIN_ADJUSTMENT", amount: reward, source: "level-up" });
    pushActivity(db, user, { kind: "LEVEL_UP", label: `saavutti Level ${after}.` });
    notify(db, user, { kind: "REWARD", title: `Level ${after}`, body: `+${reward} coins` });
  }

  return { level: after, leveledUp };
}

export type AchievementSignal = { slug: string; value: number; mode: "increment" | "max" | "set" };

export function recordAchievements(
  db: DemoDb,
  user: DemoUser,
  signals: AchievementSignal[],
): { slug: string; title: string; description: string; coinReward: number }[] {
  const unlocked: { slug: string; title: string; description: string; coinReward: number }[] = [];

  for (const signal of signals) {
    if (signal.value <= 0 && signal.mode === "increment") continue;
    const spec = ACHIEVEMENT_SPECS.find((entry) => entry.slug === signal.slug);
    if (!spec) continue;

    let record = db.achievements.find(
      (entry) => entry.userId === user.id && entry.slug === signal.slug,
    );
    if (!record) {
      record = { userId: user.id, slug: signal.slug, progress: 0, unlockedAt: null };
      db.achievements.push(record);
    }
    if (record.unlockedAt) continue;

    record.progress =
      signal.mode === "increment"
        ? record.progress + signal.value
        : signal.mode === "max"
          ? Math.max(record.progress, signal.value)
          : signal.value;

    if (record.progress >= spec.target) {
      record.unlockedAt = new Date().toISOString();
      if (spec.coinReward > 0) {
        ledger(db, user, {
          type: "ADMIN_ADJUSTMENT",
          amount: spec.coinReward,
          source: `achievement:${spec.slug}`,
        });
      }
      user.xp += spec.xpReward;
      pushActivity(db, user, {
        kind: "ACHIEVEMENT",
        label: `avasi saavutuksen ${spec.title}.`,
      });
      unlocked.push({
        slug: spec.slug,
        title: spec.title,
        description: spec.description,
        coinReward: spec.coinReward,
      });
    }
  }

  return unlocked;
}

export function updateStats(
  db: DemoDb,
  user: DemoUser,
  delta: Partial<DemoStats> & { won?: boolean },
): void {
  const stats = user.stats;
  stats.gamesPlayed += delta.gamesPlayed ?? 0;
  stats.totalWagered += delta.totalWagered ?? 0;
  stats.totalWon += delta.totalWon ?? 0;
  stats.casesOpened += delta.casesOpened ?? 0;
  stats.battlesPlayed += delta.battlesPlayed ?? 0;
  stats.battlesWon += delta.battlesWon ?? 0;
  stats.mobsDefeated += delta.mobsDefeated ?? 0;
  stats.biggestWin = Math.max(stats.biggestWin, delta.biggestWin ?? 0);
  stats.highestCrash = Math.max(stats.highestCrash, delta.highestCrash ?? 0);
  stats.bestMinesMult = Math.max(stats.bestMinesMult, delta.bestMinesMult ?? 0);
  stats.bestCombo = Math.max(stats.bestCombo, delta.bestCombo ?? 0);

  if (delta.won === true) {
    stats.winStreak += 1;
    stats.bestWinStreak = Math.max(stats.bestWinStreak, stats.winStreak);
  } else if (delta.won === false) {
    stats.winStreak = 0;
  }
}

export function recordRound(
  db: DemoDb,
  user: DemoUser,
  round: Omit<DemoRound, "id" | "userId" | "createdAt">,
): DemoRound {
  const entry: DemoRound = {
    id: randomId("rnd"),
    userId: user.id,
    createdAt: new Date().toISOString(),
    ...round,
  };
  db.rounds.unshift(entry);
  if (db.rounds.length > 300) db.rounds.length = 300;
  return entry;
}

export function leaderboardRank(db: DemoDb, userId: string): number | null {
  const user = db.users.find((entry) => entry.id === userId);
  if (!user) return null;
  return db.users.filter((entry) => entry.balance > user.balance).length + 1;
}

export function findCase(db: DemoDb, caseId: string): DemoCase {
  const entry = db.cases.find((item) => item.id === caseId || item.slug === caseId);
  if (!entry) throw new DemoError("Casea ei löytynyt.", 404);
  return entry;
}

export function publicUser(user: DemoUser) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    minecraftUsername: user.minecraftUsername,
    // The demo build has no provider sign-in, so there is never a portrait to
    // carry — but the shape has to match what the server build sends.
    avatarUrl: null,
    balance: user.balance,
    level: levelFromXp(user.xp).level,
    xp: user.xp,
  };
}
