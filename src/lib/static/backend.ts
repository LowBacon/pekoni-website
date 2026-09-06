/**
 * The static build's `/api` layer.
 *
 * `installStaticBackend()` wraps `window.fetch` and answers Pekoni's own API
 * paths from the browser-local world in `./store`. Everything else — fonts,
 * Minecraft avatars, the live server-status lookup — passes straight through to
 * the network untouched.
 *
 * The response shapes here are the same ones the route handlers in
 * `src/app/api` return, because the pages and game components are shared
 * between both builds and must not know which one they are running in.
 */

import { levelFromXp, rankTitle, XP_RULES } from "@/lib/progression";
import { formatCoins } from "@/lib/format";
import { ACHIEVEMENT_SPECS } from "@/lib/content/world";
import { BATTLE_COUNTDOWN_MS, battleTimings, BOT_NAMES, revealedRounds, validateBattleInput } from "@/lib/battles";
import { USERNAME_PATTERN } from "@/lib/validation";
import { IS_STATIC } from "./config";
import {
  awardXp,
  currentUser,
  DemoError,
  emptyStats,
  findCase,
  ledger,
  leaderboardRank,
  loadDb,
  mutate,
  notify,
  publicUser,
  pushActivity,
  randomFloat,
  randomHex,
  randomId,
  recordAchievements,
  requireUser,
  saveDb,
  sha256Hex,
  updateStats,
  weightedPick,
  type DemoBattle,
  type DemoCase,
  type DemoCaseItem,
  type DemoDb,
  type DemoUser,
} from "./store";
import {
  crashGet,
  crashPost,
  diceRoute,
  grinderPost,
  lastHopeGet,
  lastHopePost,
  minesGet,
  minesPost,
  slotsRoute,
} from "./games";

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;
const CASE_REEL_LENGTH = 60;
const CASE_WINNING_INDEX = 52;
const DAILY_REEL_LENGTH = 48;
const DAILY_WINNING_INDEX = 41;

type Ctx = {
  path: string;
  method: string;
  params: URLSearchParams;
  body: Record<string, unknown>;
};

/* -------------------------------------------------------------------------- */
/* Cases                                                                      */
/* -------------------------------------------------------------------------- */

function drawItem(items: DemoCaseItem[], roll: number) {
  const picked = weightedPick(items, roll);
  return {
    id: picked.id,
    name: picked.name,
    rarity: picked.rarity,
    icon: picked.icon,
    value: picked.value,
  };
}

function buildReel(items: DemoCaseItem[], winner: ReturnType<typeof drawItem>, length: number, at: number) {
  const reel = [];
  for (let i = 0; i < length; i += 1) {
    reel.push(i === at ? winner : drawItem(items, randomFloat()));
  }
  return reel;
}

function rarityOdds(items: DemoCaseItem[]) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const grouped = new Map<string, number>();
  for (const item of items) grouped.set(item.rarity, (grouped.get(item.rarity) ?? 0) + item.weight);
  return [...grouped.entries()]
    .map(([rarity, weight]) => ({ rarity, chance: weight / total }))
    .sort((a, b) => b.chance - a.chance);
}

function expectedValue(items: DemoCaseItem[]) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return 0;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / total;
}

/* -------------------------------------------------------------------------- */
/* Battles                                                                    */
/* -------------------------------------------------------------------------- */

function resolveBattle(db: DemoDb, battle: DemoBattle) {
  if (battle.status !== "WAITING") return;
  const theCase = findCase(db, battle.caseId);

  const totals = new Map<string, number>();
  let prizePool = 0;

  for (let round = 1; round <= battle.rounds; round += 1) {
    for (const participant of battle.participants) {
      const item = drawItem(theCase.items, randomFloat());
      battle.draws.push({ roundNumber: round, participantId: participant.id, item });
      totals.set(participant.id, (totals.get(participant.id) ?? 0) + item.value);
      prizePool += item.value;
    }
  }

  for (const participant of battle.participants) {
    participant.total = totals.get(participant.id) ?? 0;
  }

  let winners: typeof battle.participants;
  if (battle.mode === "TEAM") {
    const teamTotals = new Map<number, number>();
    for (const p of battle.participants) {
      teamTotals.set(p.team, (teamTotals.get(p.team) ?? 0) + p.total);
    }
    const best = [...teamTotals.entries()].sort((a, b) => b[1] - a[1])[0][0];
    winners = battle.participants.filter((p) => p.team === best);
  } else {
    const sorted = [...battle.participants].sort((a, b) =>
      battle.mode === "CRAZY" ? a.total - b.total : b.total - a.total,
    );
    const bestTotal = sorted[0].total;
    winners = sorted.filter((p) => p.total === bestTotal);
  }

  const share = Math.floor(prizePool / Math.max(1, winners.length));
  for (const winner of winners) {
    winner.isWinner = true;
    winner.payout = winner.userId ? share : 0;
  }

  battle.prizePool = prizePool;
  battle.status = "RUNNING";
  battle.startsAt = Date.now() + BATTLE_COUNTDOWN_MS;
}

/** Pays out any battle whose reveal clock has run out. Safe to call on reads. */
function settleFinishedBattles(db: DemoDb) {
  const now = Date.now();

  for (const battle of db.battles) {
    if (battle.status !== "RUNNING") continue;
    const { finishesAt } = battleTimings(battle.rounds, battle.startsAt);
    if (!finishesAt || finishesAt > now) continue;

    battle.status = "FINISHED";
    battle.finishedAt = new Date().toISOString();
    const theCase = db.cases.find((entry) => entry.id === battle.caseId);

    for (const participant of battle.participants) {
      if (!participant.userId) continue;
      const user = db.users.find((entry) => entry.id === participant.userId);
      if (!user) continue;

      updateStats(db, user, {
        battlesPlayed: 1,
        battlesWon: participant.isWinner ? 1 : 0,
        totalWagered: battle.entryCost,
        totalWon: participant.payout,
        biggestWin: Math.max(0, participant.payout - battle.entryCost),
      });

      if (participant.isWinner && participant.payout > 0) {
        ledger(db, user, {
          type: "BATTLE_WIN",
          amount: participant.payout,
          source: `battle:${theCase?.slug ?? "case"}`,
        });
        notify(db, user, {
          kind: "SUCCESS",
          title: "Battle voitettu",
          body: `+${formatCoins(participant.payout)} coins`,
          href: `/battles?id=${battle.id}`,
        });
        pushActivity(db, user, {
          kind: "BATTLE_WIN",
          label: `voitti ${theCase?.name ?? "case"} -battlen`,
          amount: participant.payout,
        });
        recordAchievements(db, user, [{ slug: "battle-champion", value: 1, mode: "increment" }]);
      }

      awardXp(db, user, XP_RULES.battle);
    }
  }
}

function battleView(db: DemoDb, battleId: string) {
  const battle = db.battles.find((entry) => entry.id === battleId);
  if (!battle) throw new DemoError("Battlea ei löytynyt.", 404);

  const theCase = findCase(db, battle.caseId);
  const finished = battle.status === "FINISHED" || battle.status === "CANCELLED";
  const visibleRounds = finished
    ? battle.rounds
    : revealedRounds(battle.rounds, battle.startsAt, Date.now());

  const draws = battle.draws.filter((draw) => draw.roundNumber <= visibleRounds);
  const totals = new Map<string, number>();
  for (const draw of draws) {
    totals.set(draw.participantId, (totals.get(draw.participantId) ?? 0) + draw.item.value);
  }

  const { startsAt, finishesAt } = battleTimings(battle.rounds, battle.startsAt);

  return {
    id: battle.id,
    mode: battle.mode,
    status: battle.status,
    rounds: battle.rounds,
    slots: battle.slots,
    entryCost: battle.entryCost,
    prizePool: finished ? battle.prizePool : null,
    createdAt: battle.createdAt,
    creator: battle.creator,
    case: {
      id: theCase.id,
      slug: theCase.slug,
      name: theCase.name,
      price: theCase.price,
      theme: theCase.theme,
    },
    startsAt,
    finishesAt,
    revealedRounds: visibleRounds,
    participants: battle.participants.map((participant) => ({
      id: participant.id,
      slot: participant.slot,
      team: participant.team,
      isBot: !participant.userId,
      userId: participant.userId,
      username: participant.username,
      minecraftUsername: participant.minecraftUsername,
      total: totals.get(participant.id) ?? 0,
      payout: finished ? participant.payout : null,
      isWinner: finished ? participant.isWinner : null,
    })),
    draws,
  };
}

/* -------------------------------------------------------------------------- */
/* Leaderboard                                                                */
/* -------------------------------------------------------------------------- */

function leaderboard(db: DemoDb, tab: string, range: string, viewerId: string | null) {
  const since = range === "weekly" ? Date.now() - 7 * 24 * 60 * 60 * 1000 : 0;

  const value = (user: DemoUser): number => {
    if (range === "weekly") {
      const rounds = db.rounds.filter(
        (round) => round.userId === user.id && new Date(round.createdAt).getTime() >= since,
      );
      if (tab === "games-played") return rounds.length;
      if (tab === "most-wagered") return rounds.reduce((sum, round) => sum + round.bet, 0);
      if (tab === "biggest-wins") {
        return rounds.reduce((best, round) => Math.max(best, round.payout - round.bet), 0);
      }
      if (tab === "battles") {
        return db.battles.filter(
          (battle) =>
            battle.status === "FINISHED" &&
            new Date(battle.finishedAt ?? battle.createdAt).getTime() >= since &&
            battle.participants.some((p) => p.userId === user.id && p.isWinner),
        ).length;
      }
      // "richest" has no weekly meaning — fall back to net profit.
      return rounds.reduce((sum, round) => sum + (round.payout - round.bet), 0);
    }

    switch (tab) {
      case "biggest-wins":
        return user.stats.biggestWin;
      case "most-wagered":
        return user.stats.totalWagered;
      case "games-played":
        return user.stats.gamesPlayed;
      case "battles":
        return user.stats.battlesWon;
      default:
        return user.balance;
    }
  };

  const detail = (user: DemoUser, amount: number): string => {
    switch (tab) {
      case "biggest-wins":
        return `${formatCoins(user.stats.gamesPlayed)} peliä`;
      case "most-wagered":
        return `${formatCoins(user.stats.gamesPlayed)} kierrosta`;
      case "games-played":
        return `${formatCoins(user.stats.totalWagered)} panostettu`;
      case "battles":
        return `${user.stats.battlesPlayed} battlea`;
      default:
        return `${formatCoins(user.stats.totalWon)} voitettu · ${formatCoins(amount)} saldo`;
    }
  };

  const rows = db.users
    .map((user) => ({ user, amount: value(user) }))
    .filter((entry) => entry.amount > 0 || tab === "richest")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 50)
    .map((entry, index) => {
      const level = levelFromXp(entry.user.xp).level;
      return {
        rank: index + 1,
        userId: entry.user.id,
        username: entry.user.username,
        minecraftUsername: entry.user.minecraftUsername,
        level,
        title: rankTitle(level),
        value: entry.amount,
        detail: detail(entry.user, entry.amount),
      };
    });

  const labels: Record<string, string> = {
    richest: "Saldo",
    "biggest-wins": "Suurin voitto",
    "most-wagered": "Panostettu",
    "games-played": "Pelejä",
    battles: "Battle-voitot",
  };

  return {
    tab,
    range,
    label: labels[tab] ?? "Saldo",
    rows,
    me: rows.find((row) => row.userId === viewerId) ?? null,
    viewerId,
  };
}

/* -------------------------------------------------------------------------- */
/* Daily                                                                      */
/* -------------------------------------------------------------------------- */

function dailyStatus(db: DemoDb, user: DemoUser) {
  const mine = db.daily
    .filter((entry) => entry.userId === user.id)
    .sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime());
  const last = mine[0];

  if (!last) {
    return {
      available: true,
      nextAvailableAt: null,
      streak: 0,
      lastClaimedAt: null,
      totalClaimed: 0,
    };
  }

  const claimedAt = new Date(last.claimedAt).getTime();
  const nextAt = claimedAt + DAILY_COOLDOWN_MS;
  const available = Date.now() >= nextAt;

  return {
    available,
    nextAvailableAt: available ? null : new Date(nextAt).toISOString(),
    streak: Date.now() > claimedAt + STREAK_WINDOW_MS ? 0 : last.streak,
    lastClaimedAt: last.claimedAt,
    totalClaimed: mine.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

async function route(ctx: Ctx): Promise<unknown> {
  const { path, method, params, body } = ctx;

  /* ----------------------------------------------------------------- auth */

  if (path === "/api/auth/register" && method === "POST") {
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!USERNAME_PATTERN.test(username)) {
      throw new DemoError("Käyttäjänimi: 3–16 merkkiä, vain kirjaimia, numeroita ja _.");
    }
    if (password.length < 8) {
      throw new DemoError("Salasanan tulee olla vähintään 8 merkkiä.");
    }

    const db = loadDb();
    if (db.users.some((user) => user.usernameLower === username.toLowerCase())) {
      throw new DemoError("Käyttäjänimi on jo varattu.", 409, "USERNAME_TAKEN");
    }

    const salt = randomHex(16);
    const passwordHash = await sha256Hex(`${salt}:${password}`);
    const minecraftUsername = String(body.minecraftUsername ?? "").trim() || username;

    const user: DemoUser = {
      id: randomId("usr"),
      username,
      usernameLower: username.toLowerCase(),
      email: String(body.email ?? "").trim() || null,
      passwordHash,
      salt,
      // The first account created in this browser owns the demo world, so the
      // admin surfaces are explorable. On the real server the role comes from
      // the database and is checked on every request.
      role: db.users.every((entry) => entry.demo) ? "OWNER" : "USER",
      status: "ACTIVE",
      minecraftUsername,
      xp: 0,
      balance: 1_000,
      soundEnabled: false,
      reducedMotion: false,
      publicActivity: true,
      clientSeed: randomHex(8),
      serverSeedHash: randomHex(32),
      nonce: 0,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      demo: false,
      stats: emptyStats(),
    };

    db.users.push(user);
    db.sessionUserId = user.id;
    notify(db, user, {
      kind: "INFO",
      title: "Tervetuloa Pekoniin",
      body: "Sait 1 000 coinsia matkaevääksi.",
      href: "/home",
    });
    saveDb();

    return { id: user.id, username: user.username, balance: user.balance };
  }

  if (path === "/api/auth/login" && method === "POST") {
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const db = loadDb();
    const user = db.users.find((entry) => entry.usernameLower === username);

    if (!user || !user.passwordHash || !user.salt) {
      throw new DemoError("Käyttäjänimi tai salasana on väärin.", 401);
    }
    const hash = await sha256Hex(`${user.salt}:${password}`);
    if (hash !== user.passwordHash) {
      throw new DemoError("Käyttäjänimi tai salasana on väärin.", 401);
    }

    db.sessionUserId = user.id;
    user.lastSeenAt = new Date().toISOString();
    saveDb();
    return { id: user.id, username: user.username };
  }

  if (path === "/api/auth/logout") {
    return mutate((db) => {
      db.sessionUserId = null;
      return { ok: true };
    });
  }

  /* ------------------------------------------------------------------- me */

  if (path === "/api/me") {
    const db = loadDb();
    const user = currentUser(db);
    if (user) {
      user.lastSeenAt = new Date().toISOString();
      saveDb();
    }
    return { user: user ? publicUser(user) : null };
  }

  if (path === "/api/me/settings") {
    const db = loadDb();
    const user = requireUser(db);
    return {
      settings: {
        soundEnabled: user.soundEnabled,
        reducedMotion: user.reducedMotion,
        publicActivity: user.publicActivity,
        minecraftUsername: user.minecraftUsername,
        clientSeed: user.clientSeed,
        serverSeedHash: user.serverSeedHash,
        nonce: user.nonce,
      },
    };
  }

  if (path === "/api/settings" && method === "PATCH") {
    return mutate((db) => {
      const user = requireUser(db);
      if (typeof body.soundEnabled === "boolean") user.soundEnabled = body.soundEnabled;
      if (typeof body.reducedMotion === "boolean") user.reducedMotion = body.reducedMotion;
      if (typeof body.publicActivity === "boolean") user.publicActivity = body.publicActivity;
      if (body.minecraftUsername !== undefined) {
        const value = body.minecraftUsername === null ? null : String(body.minecraftUsername).trim();
        if (value && !USERNAME_PATTERN.test(value)) {
          throw new DemoError("Minecraft-nimi: 3–16 merkkiä.");
        }
        user.minecraftUsername = value || null;
      }
      if (typeof body.clientSeed === "string" && body.clientSeed.trim().length >= 4) {
        user.clientSeed = body.clientSeed.trim().slice(0, 64);
      }

      let revealedSeed: string | null = null;
      if (body.rotateServerSeed === true) {
        revealedSeed = user.serverSeedHash;
        user.serverSeedHash = randomHex(32);
        user.nonce = 0;
      }

      return {
        settings: {
          soundEnabled: user.soundEnabled,
          reducedMotion: user.reducedMotion,
          publicActivity: user.publicActivity,
          minecraftUsername: user.minecraftUsername,
          clientSeed: user.clientSeed,
          serverSeedHash: user.serverSeedHash,
          nonce: user.nonce,
        },
        revealedSeed,
      };
    });
  }

  /* ------------------------------------------------------------- activity */

  if (path === "/api/activity") {
    const db = loadDb();
    const limit = Math.min(30, Number(params.get("limit") ?? 12) || 12);
    return { feed: db.activity.slice(0, limit) };
  }

  if (path === "/api/notifications") {
    const db = loadDb();
    const user = requireUser(db);
    if (method === "POST") {
      for (const entry of db.notifications) {
        if (entry.userId === user.id && !entry.readAt) entry.readAt = new Date().toISOString();
      }
      saveDb();
      return { ok: true };
    }
    return {
      notifications: db.notifications.filter((entry) => entry.userId === user.id).slice(0, 20),
    };
  }

  /* ---------------------------------------------------------------- pages */

  if (path === "/api/landing") {
    const db = loadDb();
    const user = currentUser(db);
    const achievement = user
      ? db.achievements
          .filter((entry) => entry.userId === user.id && entry.unlockedAt)
          .sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))[0]
      : null;
    const spec = achievement
      ? ACHIEVEMENT_SPECS.find((entry) => entry.slug === achievement.slug)
      : null;

    return {
      totals: db.users.length,
      rank: user ? leaderboardRank(db, user.id) : null,
      daily: user ? dailyStatus(db, user) : null,
      user: user ? publicUser(user) : null,
      latestAchievement:
        spec && achievement ? { title: spec.title, unlockedAt: achievement.unlockedAt } : null,
    };
  }

  if (path === "/api/home") {
    const db = loadDb();
    const user = requireUser(db);
    const biggest = db.rounds
      .filter((round) => round.userId === user.id)
      .sort((a, b) => b.payout - a.payout)[0];

    return {
      user: publicUser(user),
      rank: leaderboardRank(db, user.id),
      biggest: biggest
        ? {
            payout: biggest.payout,
            bet: biggest.bet,
            game: biggest.game,
            multiplier: biggest.multiplier,
          }
        : null,
      stats: user.stats,
    };
  }

  if (path === "/api/profile") {
    const db = loadDb();
    const user = requireUser(db);
    const progress = levelFromXp(user.xp);

    return {
      user: {
        ...publicUser(user),
        title: rankTitle(progress.level),
        createdAt: user.createdAt,
      },
      progress,
      rank: leaderboardRank(db, user.id),
      daily: dailyStatus(db, user),
      fairness: {
        serverSeedHash: user.serverSeedHash,
        clientSeed: user.clientSeed,
        nonce: user.nonce,
      },
      stats: { ...user.stats, netProfit: user.stats.totalWon - user.stats.totalWagered },
      achievements: ACHIEVEMENT_SPECS.map((spec) => {
        const record = db.achievements.find(
          (entry) => entry.userId === user.id && entry.slug === spec.slug,
        );
        return {
          slug: spec.slug,
          title: spec.title,
          description: spec.description,
          icon: spec.icon,
          category: spec.category,
          target: spec.target,
          progress: record?.progress ?? 0,
          xpReward: spec.xpReward,
          coinReward: spec.coinReward,
          unlockedAt: record?.unlockedAt ?? null,
        };
      }),
      rounds: db.rounds.filter((round) => round.userId === user.id).slice(0, 10),
      transactions: db.transactions.filter((entry) => entry.userId === user.id).slice(0, 25),
      openings: db.openings.filter((entry) => entry.userId === user.id).slice(0, 10),
      battles: db.battles
        .filter((battle) => battle.participants.some((p) => p.userId === user.id))
        .slice(0, 8)
        .map((battle) => {
          const mine = battle.participants.find((p) => p.userId === user.id)!;
          const theCase = db.cases.find((entry) => entry.id === battle.caseId);
          return {
            id: battle.id,
            caseName: theCase?.name ?? "Case",
            mode: battle.mode,
            status: battle.status,
            entryCost: battle.entryCost,
            total: mine.total,
            payout: mine.payout,
            isWinner: mine.isWinner,
            joinedAt: battle.createdAt,
          };
        }),
    };
  }

  if (path === "/api/leaderboard") {
    const db = loadDb();
    const user = requireUser(db);
    return leaderboard(db, params.get("tab") ?? "richest", params.get("range") ?? "all-time", user.id);
  }

  if (path === "/api/games/popular") {
    const db = loadDb();
    requireUser(db);
    const playCounts: Record<string, number> = {
      cases: db.openings.length,
      battles: db.battles.length,
    };
    for (const round of db.rounds) {
      playCounts[round.game] = (playCounts[round.game] ?? 0) + 1;
    }
    return { playCounts };
  }

  /* ---------------------------------------------------------------- cases */

  if (path === "/api/cases" && method === "GET") {
    const db = loadDb();
    requireUser(db);
    const includeDaily = params.get("daily") === "1";

    return {
      cases: db.cases
        .filter((entry) => includeDaily || entry.kind !== "DAILY")
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((entry) => {
          const totalWeight = entry.items.reduce((sum, item) => sum + item.weight, 0) || 1;
          return {
            id: entry.id,
            slug: entry.slug,
            name: entry.name,
            tagline: entry.tagline,
            description: entry.description,
            price: entry.price,
            theme: entry.theme,
            kind: entry.kind,
            isDaily: entry.kind === "DAILY",
            opened: db.openings.filter((opening) => opening.caseId === entry.id).length,
            expectedValue: Math.round(expectedValue(entry.items)),
            odds: rarityOdds(entry.items),
            items: entry.items
              .map((item) => ({
                id: item.id,
                name: item.name,
                rarity: item.rarity,
                icon: item.icon,
                value: item.value,
                chance: item.weight / totalWeight,
              }))
              .sort((a, b) => b.value - a.value),
          };
        }),
    };
  }

  if (path === "/api/cases/open" && method === "POST") {
    return mutate((db) => {
      const user = requireUser(db);
      const theCase: DemoCase = findCase(db, String(body.caseId ?? ""));
      if (theCase.kind === "DAILY") throw new DemoError("Daily Case avataan omalta sivultaan.");

      user.nonce += 1;
      ledger(db, user, {
        type: "CASE_PURCHASE",
        amount: theCase.price,
        source: `case:${theCase.slug}`,
      });

      const item = drawItem(theCase.items, randomFloat());
      const reel = buildReel(theCase.items, item, CASE_REEL_LENGTH, CASE_WINNING_INDEX);

      if (item.value > 0) {
        ledger(db, user, {
          type: "CASE_REWARD",
          amount: item.value,
          source: `case:${theCase.slug}`,
        });
      }

      const openingId = randomId("open");
      db.openings.unshift({
        id: openingId,
        userId: user.id,
        caseId: theCase.id,
        caseName: theCase.name,
        theme: theCase.theme,
        item: { name: item.name, rarity: item.rarity, icon: item.icon, value: item.value },
        cost: theCase.price,
        value: item.value,
        source: "SHOP",
        createdAt: new Date().toISOString(),
      });
      if (db.openings.length > 200) db.openings.length = 200;

      const profit = item.value - theCase.price;
      updateStats(db, user, { casesOpened: 1, biggestWin: profit > 0 ? profit : 0 });
      const xp = awardXp(db, user, XP_RULES.caseOpen);

      const unlocked = recordAchievements(db, user, [
        { slug: "case-collector", value: 1, mode: "increment" },
        ...(item.rarity === "LEGENDARY" || item.rarity === "MYTHIC"
          ? [{ slug: "lucky", value: 1, mode: "increment" as const }]
          : []),
      ]);

      pushActivity(db, user, {
        kind: "CASE_OPEN",
        label: `avasi ${theCase.name} — ${item.name}`,
        amount: item.value,
        rarity: item.rarity,
      });

      return {
        balance: user.balance,
        item,
        cost: theCase.price,
        profit,
        openingId,
        reel,
        winningIndex: CASE_WINNING_INDEX,
        level: xp.level,
        leveledUp: xp.leveledUp,
        unlocked,
      };
    });
  }

  /* ---------------------------------------------------------------- daily */

  if (path === "/api/daily") {
    if (method === "GET") {
      const db = loadDb();
      const user = requireUser(db);
      return dailyStatus(db, user);
    }

    return mutate((db) => {
      const user = requireUser(db);
      const status = dailyStatus(db, user);
      if (!status.available) throw new DemoError("Daily Case ei ole vielä avattavissa.");

      const theCase = db.cases.find((entry) => entry.kind === "DAILY");
      if (!theCase) throw new DemoError("Daily Casea ei löytynyt.", 404);

      user.nonce += 1;
      const item = drawItem(theCase.items, randomFloat());
      const reel = buildReel(theCase.items, item, DAILY_REEL_LENGTH, DAILY_WINNING_INDEX);

      const previous = db.daily
        .filter((entry) => entry.userId === user.id)
        .sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime())[0];
      const continues =
        previous && Date.now() <= new Date(previous.claimedAt).getTime() + STREAK_WINDOW_MS;
      const streak = continues ? previous.streak + 1 : 1;

      ledger(db, user, { type: "DAILY_REWARD", amount: item.value, source: "daily-case" });

      const now = new Date();
      db.daily.unshift({
        id: randomId("daily"),
        userId: user.id,
        amount: item.value,
        streak,
        itemName: item.name,
        rarity: item.rarity,
        claimedAt: now.toISOString(),
      });

      db.openings.unshift({
        id: randomId("open"),
        userId: user.id,
        caseId: theCase.id,
        caseName: theCase.name,
        theme: theCase.theme,
        item: { name: item.name, rarity: item.rarity, icon: item.icon, value: item.value },
        cost: 0,
        value: item.value,
        source: "DAILY",
        createdAt: now.toISOString(),
      });

      const xp = awardXp(db, user, XP_RULES.dailyCase);
      const unlocked = recordAchievements(db, user, [
        { slug: "og-player", value: streak, mode: "max" },
        ...(item.rarity === "LEGENDARY" || item.rarity === "MYTHIC"
          ? [{ slug: "lucky", value: 1, mode: "increment" as const }]
          : []),
      ]);

      pushActivity(db, user, {
        kind: "CASE_OPEN",
        label: `avasi Daily Casen — ${item.name}`,
        amount: item.value,
        rarity: item.rarity,
      });

      return {
        balance: user.balance,
        item,
        amount: item.value,
        streak,
        reel,
        winningIndex: DAILY_WINNING_INDEX,
        nextAvailableAt: new Date(now.getTime() + DAILY_COOLDOWN_MS).toISOString(),
        level: xp.level,
        leveledUp: xp.leveledUp,
        unlocked,
      };
    });
  }

  /* -------------------------------------------------------------- battles */

  if (path === "/api/battles") {
    if (method === "GET") {
      return mutate((db) => {
        requireUser(db);
        settleFinishedBattles(db);

        return {
          battles: db.battles
            .filter((battle) => battle.status === "WAITING" || battle.status === "RUNNING")
            .slice(0, 24)
            .map((battle) => {
              const theCase = findCase(db, battle.caseId);
              return {
                id: battle.id,
                mode: battle.mode,
                status: battle.status,
                rounds: battle.rounds,
                slots: battle.slots,
                entryCost: battle.entryCost,
                case: {
                  slug: theCase.slug,
                  name: theCase.name,
                  price: theCase.price,
                  theme: theCase.theme,
                },
                createdAt: battle.createdAt,
                participants: battle.participants.map((participant) => ({
                  slot: participant.slot,
                  isBot: !participant.userId,
                  username: participant.username,
                  minecraftUsername: participant.minecraftUsername,
                })),
              };
            }),
          recent: db.battles
            .filter((battle) => battle.status === "FINISHED")
            .slice(0, 8)
            .map((battle) => {
              const theCase = findCase(db, battle.caseId);
              return {
                id: battle.id,
                mode: battle.mode,
                caseName: theCase.name,
                theme: theCase.theme,
                prizePool: battle.prizePool,
                finishedAt: battle.finishedAt,
                winners: battle.participants
                  .filter((participant) => participant.isWinner)
                  .map((participant) => ({
                    username: participant.username,
                    minecraftUsername: participant.minecraftUsername,
                  })),
              };
            }),
        };
      });
    }

    // create
    return mutate((db) => {
      const user = requireUser(db);
      const theCase = findCase(db, String(body.caseId ?? ""));
      if (theCase.kind === "DAILY") throw new DemoError("Casea ei löytynyt.", 404);

      const { rounds, slots, mode, bots } = validateBattleInput(
        body as { rounds: unknown; slots: unknown; mode: unknown; bots?: unknown },
      );
      const entryCost = theCase.price * rounds;

      ledger(db, user, {
        type: "BATTLE_ENTRY",
        amount: entryCost * (1 + bots),
        source: `battle:${theCase.slug}`,
      });

      const battle: DemoBattle = {
        id: randomId("btl"),
        caseId: theCase.id,
        creatorId: user.id,
        creator: user.username,
        mode,
        rounds,
        slots,
        entryCost,
        prizePool: 0,
        status: "WAITING",
        startsAt: null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
        participants: [
          {
            id: randomId("bp"),
            slot: 0,
            team: 0,
            userId: user.id,
            botName: null,
            username: user.username,
            minecraftUsername: user.minecraftUsername,
            total: 0,
            payout: 0,
            isWinner: false,
          },
        ],
        draws: [],
      };

      for (let i = 0; i < bots; i += 1) {
        battle.participants.push({
          id: randomId("bp"),
          slot: i + 1,
          team: (i + 1) % 2,
          userId: null,
          botName: BOT_NAMES[Math.floor(randomFloat() * BOT_NAMES.length)],
          username: BOT_NAMES[Math.floor(randomFloat() * BOT_NAMES.length)],
          minecraftUsername: null,
          total: 0,
          payout: 0,
          isWinner: false,
        });
      }

      db.battles.unshift(battle);
      if (db.battles.length > 40) db.battles.length = 40;

      if (battle.participants.length >= slots) resolveBattle(db, battle);

      return { battleId: battle.id };
    });
  }

  const battleMatch = /^\/api\/battles\/([^/]+)(\/join)?$/.exec(path);
  if (battleMatch) {
    const battleId = battleMatch[1];

    if (battleMatch[2]) {
      return mutate((db) => {
        const user = requireUser(db);
        const battle = db.battles.find((entry) => entry.id === battleId);
        if (!battle) throw new DemoError("Battlea ei löytynyt.", 404);
        if (battle.status !== "WAITING") throw new DemoError("Battle on jo alkanut.");
        if (battle.participants.some((p) => p.userId === user.id)) {
          throw new DemoError("Olet jo mukana tässä battlessa.");
        }
        if (battle.participants.length >= battle.slots) throw new DemoError("Battle on täynnä.");

        ledger(db, user, {
          type: "BATTLE_ENTRY",
          amount: battle.entryCost,
          source: "battle:join",
        });

        const taken = new Set(battle.participants.map((p) => p.slot));
        let slot = 0;
        while (taken.has(slot)) slot += 1;

        battle.participants.push({
          id: randomId("bp"),
          slot,
          team: slot % 2,
          userId: user.id,
          botName: null,
          username: user.username,
          minecraftUsername: user.minecraftUsername,
          total: 0,
          payout: 0,
          isWinner: false,
        });

        if (battle.participants.length >= battle.slots) resolveBattle(db, battle);

        return { battleId };
      });
    }

    return mutate((db) => {
      requireUser(db);
      settleFinishedBattles(db);
      return battleView(db, battleId);
    });
  }

  /* ---------------------------------------------------------------- games */

  if (path === "/api/games/dice") {
    return mutate((db) => diceRoute(db, body as never));
  }
  if (path === "/api/games/slots") {
    return mutate((db) => slotsRoute(db, body as never));
  }
  if (path === "/api/games/mines") {
    return method === "GET" ? mutate(minesGet) : mutate((db) => minesPost(db, body as never));
  }
  if (path === "/api/games/crash") {
    return method === "GET" ? mutate(crashGet) : mutate((db) => crashPost(db, body as never));
  }
  if (path === "/api/games/lasthope") {
    return method === "GET"
      ? mutate(lastHopeGet)
      : mutate((db) => lastHopePost(db, body as never));
  }
  if (path === "/api/games/mobgrinder") {
    return mutate((db) => grinderPost(db, body as never));
  }

  /* ---------------------------------------------------------------- admin */

  if (path === "/api/admin/overview") {
    const db = loadDb();
    const user = requireUser(db);
    if (user.role === "USER") throw new DemoError("Ei käyttöoikeutta.", 403);

    const days = Number(params.get("days") ?? 7) || 7;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const rounds = db.rounds.filter((round) => new Date(round.createdAt).getTime() >= since);
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const totalWagered = rounds.reduce((sum, round) => sum + round.bet, 0);
    const totalPayout = rounds.reduce((sum, round) => sum + round.payout, 0);

    const sumType = (type: string) =>
      db.transactions
        .filter((entry) => entry.type === type && new Date(entry.createdAt).getTime() >= since)
        .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);

    const gameMap = new Map<string, { rounds: number; wagered: number; payout: number }>();
    for (const round of rounds) {
      const entry = gameMap.get(round.game) ?? { rounds: 0, wagered: 0, payout: 0 };
      entry.rounds += 1;
      entry.wagered += round.bet;
      entry.payout += round.payout;
      gameMap.set(round.game, entry);
    }

    const seriesDays = Math.min(days, 30);
    const series: { date: string; wagered: number; payout: number; rounds: number }[] = [];
    for (let i = seriesDays - 1; i >= 0; i -= 1) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = day.toISOString().slice(0, 10);
      const dayRounds = db.rounds.filter((round) => round.createdAt.slice(0, 10) === key);
      series.push({
        date: key,
        wagered: dayRounds.reduce((sum, round) => sum + round.bet, 0),
        payout: dayRounds.reduce((sum, round) => sum + round.payout, 0),
        rounds: dayRounds.length,
      });
    }

    const caseMap = new Map<string, { opened: number; spent: number; returned: number }>();
    for (const opening of db.openings) {
      const entry = caseMap.get(opening.caseId) ?? { opened: 0, spent: 0, returned: 0 };
      entry.opened += 1;
      entry.spent += opening.cost;
      entry.returned += opening.value;
      caseMap.set(opening.caseId, entry);
    }

    const battleStatuses = new Map<string, number>();
    for (const battle of db.battles) {
      battleStatuses.set(battle.status, (battleStatuses.get(battle.status) ?? 0) + 1);
    }

    return {
      days,
      role: user.role,
      overview: {
        users: db.users.length,
        dau: db.users.filter((entry) => new Date(entry.lastSeenAt).getTime() >= dayAgo).length,
        wau: db.users.filter((entry) => new Date(entry.lastSeenAt).getTime() >= weekAgo).length,
        suspended: db.users.filter((entry) => entry.status === "SUSPENDED").length,
        rounds24: db.rounds.filter((round) => new Date(round.createdAt).getTime() >= dayAgo).length,
        coinsInCirculation: db.users.reduce((sum, entry) => sum + entry.balance, 0),
        openBattles: db.battles.filter(
          (battle) => battle.status === "WAITING" || battle.status === "RUNNING",
        ).length,
        casesOpened: db.openings.filter(
          (opening) => new Date(opening.createdAt).getTime() >= weekAgo,
        ).length,
      },
      snapshot: {
        totalWagered,
        totalPayout,
        gameDelta: totalWagered - totalPayout,
        caseSpend: sumType("CASE_PURCHASE"),
        caseReward: sumType("CASE_REWARD"),
        dailyPaid: sumType("DAILY_REWARD"),
        adminAdjust: sumType("ADMIN_ADJUSTMENT"),
        activeUsers: db.users.filter((entry) => new Date(entry.lastSeenAt).getTime() >= since).length,
        rounds: rounds.length,
        roundsPerUser: rounds.length / Math.max(1, db.users.filter((entry) => !entry.demo).length),
      },
      games: [...gameMap.entries()]
        .map(([game, entry]) => ({
          game,
          rounds: entry.rounds,
          wagered: entry.wagered,
          payout: entry.payout,
          hold: entry.wagered - entry.payout,
          rtp: entry.wagered > 0 ? entry.payout / entry.wagered : 0,
        }))
        .sort((a, b) => b.rounds - a.rounds),
      series,
      cases: [...caseMap.entries()]
        .map(([id, entry]) => {
          const theCase = db.cases.find((item) => item.id === id);
          return {
            id,
            name: theCase?.name ?? "—",
            price: theCase?.price ?? 0,
            opened: entry.opened,
            spent: entry.spent,
            returned: entry.returned,
          };
        })
        .sort((a, b) => b.opened - a.opened),
      battles: [...battleStatuses.entries()].map(([status, count]) => ({ status, count })),
      logs: db.audit.slice(0, 40),
    };
  }

  if (path === "/api/admin/users") {
    const db = loadDb();
    const actor = requireUser(db);
    if (actor.role === "USER") throw new DemoError("Ei käyttöoikeutta.", 403);

    const query = (params.get("q") ?? "").trim().toLowerCase();
    return {
      users: db.users
        .filter((entry) => !query || entry.usernameLower.includes(query))
        .slice(0, 25)
        .map((entry) => ({
          id: entry.id,
          username: entry.username,
          email: entry.email,
          role: entry.role,
          status: entry.status,
          minecraftUsername: entry.minecraftUsername,
          balance: entry.balance,
          level: levelFromXp(entry.xp).level,
          gamesPlayed: entry.stats.gamesPlayed,
          totalWagered: entry.stats.totalWagered,
          createdAt: entry.createdAt,
          lastSeenAt: entry.lastSeenAt,
        })),
    };
  }

  if (path === "/api/admin/actions" && method === "POST") {
    return mutate((db) => {
      const actor = requireUser(db);
      if (actor.role === "USER") throw new DemoError("Ei käyttöoikeutta.", 403);

      const action = String(body.action ?? "");
      const target = db.users.find((entry) => entry.id === String(body.targetId ?? ""));
      if (!target) throw new DemoError("Käyttäjää ei löytynyt.", 404);
      const amount = Math.trunc(Number(body.amount ?? 0));
      let summary = "";

      switch (action) {
        case "ADD_COINS":
          if (amount <= 0) throw new DemoError("Summan tulee olla positiivinen.");
          ledger(db, target, { type: "ADMIN_ADJUSTMENT", amount, source: "admin" });
          summary = `Lisäsi ${formatCoins(amount)} coins`;
          break;
        case "REMOVE_COINS": {
          if (amount <= 0) throw new DemoError("Summan tulee olla positiivinen.");
          const removed = Math.min(amount, target.balance);
          ledger(db, target, { type: "ADMIN_ADJUSTMENT", amount: -removed, source: "admin" });
          summary = `Poisti ${formatCoins(removed)} coins`;
          break;
        }
        case "SUSPEND":
          if (target.id === actor.id) throw new DemoError("Et voi jäädyttää itseäsi.");
          target.status = "SUSPENDED";
          summary = "Jäädytti tilin";
          break;
        case "RESTORE":
          target.status = "ACTIVE";
          summary = "Palautti tilin";
          break;
        case "RESET_DAILY_COOLDOWN":
          db.daily = db.daily.filter((entry) => entry.userId !== target.id);
          summary = "Nollasi daily-jäähyn";
          break;
        case "SET_ROLE": {
          if (actor.role !== "OWNER") throw new DemoError("Vain omistaja voi tehdä tämän.", 403);
          if (target.id === actor.id) throw new DemoError("Et voi muuttaa omaa rooliasi.");
          const role = String(body.role ?? "USER") as DemoUser["role"];
          target.role = role;
          summary = `Asetti rooliksi ${role}`;
          break;
        }
        default:
          throw new DemoError("Tuntematon toiminto.");
      }

      db.audit.unshift({
        id: randomId("log"),
        action,
        summary: `${summary}${body.reason ? ` — ${String(body.reason)}` : ""}`,
        actor: actor.username,
        target: target.username,
        createdAt: new Date().toISOString(),
      });
      if (db.audit.length > 200) db.audit.length = 200;

      return { ok: true, balance: target.balance };
    });
  }

  throw new DemoError("Tätä toimintoa ei ole staattisessa demossa.", 404);
}

/* -------------------------------------------------------------------------- */
/* Installation                                                               */
/* -------------------------------------------------------------------------- */

let installed = false;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? {}), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Returns the `/api/...` path this request targets, or null if it is not ours. */
function apiPathOf(url: URL): string | null {
  if (url.origin !== window.location.origin) return null;
  const index = url.pathname.indexOf("/api/");
  if (index === -1) return null;
  return url.pathname.slice(index).replace(/\/$/, "");
}

export function installStaticBackend(): void {
  if (!IS_STATIC || installed || typeof window === "undefined") return;
  installed = true;

  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: URL;
    try {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      url = new URL(raw, window.location.href);
    } catch {
      return original(input as RequestInfo, init);
    }

    const path = apiPathOf(url);
    if (!path) return original(input as RequestInfo, init);

    // The live Minecraft status is real data even here: the browser queries the
    // public API directly rather than inventing a player count.
    if (path === "/api/server-status") {
      return jsonResponse(await liveServerStatus(original));
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    let body: Record<string, unknown> = {};
    if (init?.body && typeof init.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    try {
      const data = await route({ path, method, params: url.searchParams, body });
      return jsonResponse(data);
    } catch (error) {
      if (error instanceof DemoError) {
        return jsonResponse({ error: error.message, code: error.code }, error.status);
      }
      if (error instanceof Error) {
        return jsonResponse({ error: error.message }, 400);
      }
      return jsonResponse({ error: "Jokin meni pieleen." }, 500);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Live server status                                                         */
/* -------------------------------------------------------------------------- */

// Baked in at build time — the static build has no server env to read at
// runtime. Override with NEXT_PUBLIC_PEKONI_* when building.
const JAVA_HOST = process.env.NEXT_PUBLIC_PEKONI_JAVA_HOST || "Finlandsmp.usga.me";
const BEDROCK_HOST = process.env.NEXT_PUBLIC_PEKONI_BEDROCK_HOST || "Finlandsmp.usga.me";
const BEDROCK_PORT = process.env.NEXT_PUBLIC_PEKONI_BEDROCK_PORT || "12009";

type StatusPayload = {
  online?: boolean;
  players?: { online?: number; max?: number };
  version?: string | { name_clean?: string };
  motd?: { clean?: string[] };
};

async function editionStatus(
  fetcher: typeof fetch,
  host: string,
  address: string,
  edition: "JAVA" | "BEDROCK",
) {
  const base = edition === "BEDROCK" ? "bedrock/3" : "3";
  const now = new Date().toISOString();

  try {
    const response = await fetcher(`https://api.mcsrvstat.us/${base}/${encodeURIComponent(host)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as StatusPayload;

    return {
      edition,
      host,
      address,
      online: Boolean(data.online),
      playersOnline: data.online ? (data.players?.online ?? null) : null,
      playersMax: data.online ? (data.players?.max ?? null) : null,
      version:
        typeof data.version === "string" ? data.version : (data.version?.name_clean ?? null),
      motd: data.motd?.clean?.join(" ") ?? null,
      error: null as string | null,
      fetchedAt: now,
      stale: false,
    };
  } catch {
    // A failed lookup says so. It never falls back to a made-up count.
    return {
      edition,
      host,
      address,
      online: false,
      playersOnline: null,
      playersMax: null,
      version: null,
      motd: null,
      error: "Tilatietoa ei saatu haettua.",
      fetchedAt: now,
      stale: false,
    };
  }
}

async function liveServerStatus(fetcher: typeof fetch) {
  const [java, bedrock] = await Promise.all([
    editionStatus(fetcher, JAVA_HOST, JAVA_HOST, "JAVA"),
    editionStatus(
      fetcher,
      `${BEDROCK_HOST}:${BEDROCK_PORT}`,
      `${BEDROCK_HOST}:${BEDROCK_PORT}`,
      "BEDROCK",
    ),
  ]);

  return {
    java,
    bedrock,
    online: java.online || bedrock.online,
    playersOnline: java.online ? java.playersOnline : bedrock.online ? bedrock.playersOnline : null,
  };
}
