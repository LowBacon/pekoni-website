/**
 * Game settlement for the static (GitHub Pages) build.
 *
 * This mirrors `src/server/games/engine.ts` and the six game routes so the
 * client components see byte-identical responses in both builds. The pure game
 * mathematics is imported from `src/lib/games/*` — the same module the server
 * uses — so the odds, the paytable and the house edge are not re-implemented
 * here, only the plumbing around them.
 */

import { XP_RULES } from "@/lib/progression";
import type { FairStream } from "@/lib/games/types";
import { formatCoins } from "@/lib/format";
import { assertBet } from "@/lib/games/config";
import { rollDice, validateDice } from "@/lib/games/dice";
import { spinSlots } from "@/lib/games/slots";
import {
  layMines,
  MINES_TILES,
  minesMultiplier,
  validateMineCount,
  validateTileIndex,
  type MinesState,
} from "@/lib/games/mines";
import {
  CRASH_GROWTH_PER_SECOND,
  crashPointFrom,
  resolveCashout,
  timeToReach,
  validateAutoCashout,
  type CrashState,
} from "@/lib/games/crash";
import {
  LAST_HOPE_STAGES,
  MAX_STAGE,
  rollStages,
  stageMultiplier,
  type LastHopeState,
} from "@/lib/games/lasthope";
import {
  buildWaves,
  comboMultiplier,
  COMBO_WINDOW_MS,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  HIT_BURST,
  MAX_HITS_PER_SECOND,
  maxPayout,
  MOB_BY_KEY,
  PLAYER_DAMAGE,
  ROUND_DURATION_MS,
  type GrinderState,
} from "@/lib/games/mobgrinder";
import {
  awardXp,
  DemoError,
  ledger,
  pushActivity,
  randomFloat,
  randomId,
  randomStream,
  recordAchievements,
  recordRound,
  requireUser,
  updateStats,
  type AchievementSignal,
  type DemoDb,
  type DemoGameSession,
  type DemoStats,
  type DemoUser,
} from "./store";

type Resolution = {
  payout: number;
  multiplier: number;
  result: Record<string, unknown>;
  achievements?: AchievementSignal[];
  stats?: Partial<DemoStats>;
  activityLabel?: string;
};

/** The single-request settlement path: debit, roll, credit, record. */
function settleInstant(
  db: DemoDb,
  user: DemoUser,
  game: string,
  bet: number,
  resolve: (rng: FairStream, ctx: { bet: number }) => Resolution,
) {
  user.nonce += 1;
  ledger(db, user, { type: "GAME_BET", amount: bet, source: game });

  const resolution = resolve(randomStream(), { bet });
  const payout = Math.max(0, Math.trunc(resolution.payout));
  const outcome: "WIN" | "LOSS" | "PUSH" = payout > bet ? "WIN" : payout === bet ? "PUSH" : "LOSS";

  if (payout > 0) {
    ledger(db, user, { type: "GAME_WIN", amount: payout, source: game });
  }

  const round = recordRound(db, user, {
    game,
    bet,
    payout,
    multiplier: resolution.multiplier,
    outcome,
  });

  const profit = payout - bet;

  updateStats(db, user, {
    gamesPlayed: 1,
    totalWagered: bet,
    totalWon: payout,
    biggestWin: profit > 0 ? profit : 0,
    won: outcome === "WIN",
    ...resolution.stats,
  });

  const xp = awardXp(db, user, XP_RULES.perRound(bet) + (outcome === "WIN" ? XP_RULES.winBonus : 0));

  const unlocked = recordAchievements(db, user, [
    { slug: "first-win", value: outcome === "WIN" ? 1 : 0, mode: "increment" },
    { slug: "high-roller", value: bet, mode: "max" },
    ...(resolution.achievements ?? []),
  ]);

  if (resolution.activityLabel && profit > 0) {
    pushActivity(db, user, {
      kind: "GAME_WIN",
      label: resolution.activityLabel,
      amount: profit,
    });
  }

  return {
    balance: user.balance,
    bet,
    payout,
    profit,
    multiplier: resolution.multiplier,
    outcome,
    roundId: round.id,
    result: resolution.result,
    fair: { serverSeedHash: user.serverSeedHash, clientSeed: user.clientSeed, nonce: user.nonce },
    level: xp.level,
    leveledUp: xp.leveledUp,
    unlocked,
  };
}

function openSession(
  db: DemoDb,
  user: DemoUser,
  game: string,
  bet: number,
  state: unknown,
  ttlMs = 15 * 60 * 1000,
): DemoGameSession {
  const stale = db.sessions.find(
    (entry) => entry.userId === user.id && entry.game === game && entry.status === "ACTIVE",
  );
  if (stale) {
    if (stale.expiresAt > Date.now()) {
      throw new DemoError(`Sinulla on jo kesken oleva ${game}-kierros.`);
    }
    stale.status = "EXPIRED";
  }

  user.nonce += 1;
  ledger(db, user, { type: "GAME_BET", amount: bet, source: game });

  const session: DemoGameSession = {
    id: randomId("gs"),
    userId: user.id,
    game,
    status: "ACTIVE",
    bet,
    state: JSON.stringify(state),
    startedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  db.sessions.unshift(session);
  if (db.sessions.length > 40) db.sessions.length = 40;
  return session;
}

function activeSession(db: DemoDb, user: DemoUser, sessionId: string, game: string): DemoGameSession {
  const session = db.sessions.find(
    (entry) =>
      entry.id === sessionId &&
      entry.userId === user.id &&
      entry.game === game &&
      entry.status === "ACTIVE",
  );
  if (!session) throw new DemoError("Kierrosta ei löytynyt tai se on jo päättynyt.", 404);
  if (session.expiresAt < Date.now()) {
    session.status = "EXPIRED";
    throw new DemoError("Kierros on vanhentunut.", 410);
  }
  return session;
}

/** Closes a multi-step round: credit, record, stats, XP, achievements. */
function closeSession(
  db: DemoDb,
  user: DemoUser,
  session: DemoGameSession,
  input: {
    payout: number;
    multiplier: number;
    status: "CASHED_OUT" | "BUSTED";
    stats?: Partial<DemoStats>;
    achievements?: AchievementSignal[];
    activityLabel?: string;
  },
) {
  const payout = Math.max(0, Math.trunc(input.payout));
  session.status = input.status;

  if (payout > 0) {
    ledger(db, user, { type: "GAME_WIN", amount: payout, source: session.game });
  }

  const profit = payout - session.bet;
  const outcome: "WIN" | "LOSS" | "PUSH" =
    payout > session.bet ? "WIN" : payout === session.bet ? "PUSH" : "LOSS";

  recordRound(db, user, {
    game: session.game,
    bet: session.bet,
    payout,
    multiplier: input.multiplier,
    outcome,
  });

  updateStats(db, user, {
    gamesPlayed: 1,
    totalWagered: session.bet,
    totalWon: payout,
    biggestWin: profit > 0 ? profit : 0,
    won: outcome === "WIN",
    ...input.stats,
  });

  const xp = awardXp(
    db,
    user,
    XP_RULES.perRound(session.bet) + (outcome === "WIN" ? XP_RULES.winBonus : 0),
  );

  const unlocked = recordAchievements(db, user, [
    { slug: "first-win", value: outcome === "WIN" ? 1 : 0, mode: "increment" },
    { slug: "high-roller", value: session.bet, mode: "max" },
    ...(input.achievements ?? []),
  ]);

  if (input.activityLabel && profit > 0) {
    pushActivity(db, user, { kind: "GAME_WIN", label: input.activityLabel, amount: profit });
  }

  return { balance: user.balance, level: xp.level, leveledUp: xp.leveledUp, unlocked };
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

export function diceRoute(db: DemoDb, body: { bet: number; target: number; direction: string }) {
  const user = requireUser(db);
  const bet = assertBet(body.bet, "dice");
  const { target, direction } = validateDice(body.target, body.direction);

  return settleInstant(db, user, "dice", bet, (rng, ctx) => {
    const roll = rollDice(rng, ctx.bet, target, direction);
    return {
      payout: roll.payout,
      multiplier: roll.multiplier,
      result: {
        roll: roll.roll,
        target,
        direction,
        won: roll.won,
        winChance: roll.winChance,
      },
      activityLabel: `voitti ${formatCoins(roll.payout - ctx.bet)} coins Dicessä`,
    };
  });
}

export function slotsRoute(db: DemoDb, body: { bet: number }) {
  const user = requireUser(db);
  const bet = assertBet(body.bet, "slots");

  return settleInstant(db, user, "slots", bet, (rng, ctx) => {
    const spin = spinSlots(rng, ctx.bet);
    return {
      payout: spin.payout,
      multiplier: spin.multiplier,
      result: { grid: spin.grid, wins: spin.wins },
      achievements: [{ slug: "first-spin", value: 1, mode: "increment" }],
      activityLabel: `voitti ${formatCoins(spin.payout - ctx.bet)} coins Slotsissa`,
    };
  });
}

/* --------------------------------- mines --------------------------------- */

export function minesGet(db: DemoDb) {
  const user = requireUser(db);
  const session = db.sessions.find(
    (entry) =>
      entry.userId === user.id &&
      entry.game === "mines" &&
      entry.status === "ACTIVE" &&
      entry.expiresAt > Date.now(),
  );
  if (!session) return { session: null };

  const state = JSON.parse(session.state) as MinesState;
  const multiplier = minesMultiplier(state.mineCount, state.revealed.length);
  return {
    session: {
      sessionId: session.id,
      bet: session.bet,
      mineCount: state.mineCount,
      revealed: state.revealed,
      multiplier,
      profit: Math.floor(session.bet * multiplier) - session.bet,
    },
  };
}

export function minesPost(
  db: DemoDb,
  body: { action: string; bet?: number; mines?: number; sessionId?: string; tile?: number },
) {
  const user = requireUser(db);

  if (body.action === "start") {
    const bet = assertBet(body.bet ?? 0, "mines");
    const mineCount = validateMineCount(body.mines);
    const session = openSession(db, user, "mines", bet, { mines: [], mineCount, revealed: [] });
    const mines = layMines(mineCount, randomStream());
    session.state = JSON.stringify({ mines, mineCount, revealed: [] } satisfies MinesState);
    return { sessionId: session.id, balance: user.balance, bet, mineCount };
  }

  const session = activeSession(db, user, body.sessionId ?? "", "mines");
  const state = JSON.parse(session.state) as MinesState;

  if (body.action === "reveal") {
    const tile = validateTileIndex(body.tile);
    if (state.revealed.includes(tile)) throw new DemoError("Ruutu on jo avattu.");

    if (state.mines.includes(tile)) {
      const closed = closeSession(db, user, session, {
        payout: 0,
        multiplier: 0,
        status: "BUSTED",
      });
      return {
        outcome: "BUSTED" as const,
        tile,
        mines: state.mines,
        revealed: [...state.revealed, tile],
        ...closed,
      };
    }

    const revealed = [...state.revealed, tile];
    session.state = JSON.stringify({ ...state, revealed } satisfies MinesState);

    const multiplier = minesMultiplier(state.mineCount, revealed.length);
    const safeTiles = MINES_TILES - state.mineCount;

    return {
      outcome: "SAFE" as const,
      tile,
      revealed,
      multiplier,
      profit: Math.floor(session.bet * multiplier) - session.bet,
      nextMultiplier:
        revealed.length < safeTiles ? minesMultiplier(state.mineCount, revealed.length + 1) : null,
      allClear: revealed.length === safeTiles,
    };
  }

  // cashout
  if (state.revealed.length === 0) {
    throw new DemoError("Avaa vähintään yksi ruutu ennen lunastusta.");
  }
  const multiplier = minesMultiplier(state.mineCount, state.revealed.length);
  const payout = Math.floor(session.bet * multiplier);
  const profit = payout - session.bet;

  const closed = closeSession(db, user, session, {
    payout,
    multiplier,
    status: "CASHED_OUT",
    stats: { bestMinesMult: multiplier },
    achievements: [
      { slug: "lucky-miner", value: state.revealed.length, mode: "increment" },
      ...(multiplier >= 10
        ? [{ slug: "mine-sweeper", value: 1, mode: "increment" as const }]
        : []),
    ],
    activityLabel: `voitti ${formatCoins(profit)} coins Minesissä`,
  });

  return {
    outcome: "CASHED_OUT" as const,
    payout,
    profit,
    multiplier,
    mines: state.mines,
    ...closed,
  };
}

/* --------------------------------- crash --------------------------------- */

export function crashGet(db: DemoDb) {
  const user = requireUser(db);
  const session = db.sessions.find(
    (entry) =>
      entry.userId === user.id &&
      entry.game === "crash" &&
      entry.status === "ACTIVE" &&
      entry.expiresAt > Date.now(),
  );
  if (!session) return { session: null };

  const state = JSON.parse(session.state) as CrashState;
  return {
    session: {
      sessionId: session.id,
      bet: session.bet,
      startedAt: state.startedAt,
      growth: CRASH_GROWTH_PER_SECOND,
      autoCashout: state.autoCashout,
    },
  };
}

export function crashPost(
  db: DemoDb,
  body: { action: string; bet?: number; autoCashout?: number | null; sessionId?: string },
) {
  const user = requireUser(db);

  if (body.action === "start") {
    const bet = assertBet(body.bet ?? 0, "crash");
    const autoCashout = validateAutoCashout(body.autoCashout ?? null);
    const session = openSession(db, user, "crash", bet, {}, 30 * 60 * 1000);

    const crashPoint = crashPointFrom(randomFloat());
    const startedAt = Date.now();
    session.state = JSON.stringify({ crashPoint, autoCashout, startedAt } satisfies CrashState);

    return {
      sessionId: session.id,
      bet,
      startedAt,
      growth: CRASH_GROWTH_PER_SECOND,
      autoCashout,
      balance: user.balance,
    };
  }

  const manual = body.action === "cashout";
  const session = activeSession(db, user, body.sessionId ?? "", "crash");
  const state = JSON.parse(session.state) as CrashState;
  const now = Date.now();

  const autoReached =
    state.autoCashout !== null && state.autoCashout <= state.crashPoint
      ? now - state.startedAt >= timeToReach(state.autoCashout)
      : false;

  let multiplier: number;
  let busted: boolean;

  if (autoReached) {
    multiplier = state.autoCashout as number;
    busted = false;
  } else if (manual) {
    const resolved = resolveCashout(state, now);
    multiplier = resolved.multiplier;
    busted = resolved.busted;
  } else {
    const resolved = resolveCashout(state, now);
    if (!resolved.busted) return { pending: true as const, crashPoint: null };
    multiplier = state.crashPoint;
    busted = true;
  }

  const payout = busted ? 0 : Math.floor(session.bet * multiplier);
  const profit = payout - session.bet;

  const closed = closeSession(db, user, session, {
    payout,
    multiplier: busted ? 0 : multiplier,
    status: busted ? "BUSTED" : "CASHED_OUT",
    stats: busted ? {} : { highestCrash: multiplier },
    achievements: busted
      ? []
      : [
          ...(multiplier >= 10
            ? [{ slug: "diamond-hands", value: 1, mode: "increment" as const }]
            : []),
          ...(multiplier >= 25
            ? [{ slug: "crash-master", value: 1, mode: "increment" as const }]
            : []),
        ],
    activityLabel: `voitti ${formatCoins(profit)} coins Crashissa`,
  });

  return {
    pending: false as const,
    busted,
    multiplier: busted ? state.crashPoint : multiplier,
    crashPoint: state.crashPoint,
    payout,
    profit,
    auto: autoReached,
    ...closed,
  };
}

/* ------------------------------- last hope -------------------------------- */

export function lastHopeGet(db: DemoDb) {
  const user = requireUser(db);
  const session = db.sessions.find(
    (entry) =>
      entry.userId === user.id &&
      entry.game === "lasthope" &&
      entry.status === "ACTIVE" &&
      entry.expiresAt > Date.now(),
  );
  if (!session) return { session: null };

  const state = JSON.parse(session.state) as LastHopeState;
  return {
    session: {
      sessionId: session.id,
      bet: session.bet,
      stage: state.stage,
      multiplier: stageMultiplier(state.stage),
    },
  };
}

export function lastHopePost(db: DemoDb, body: { action: string; bet?: number; sessionId?: string }) {
  const user = requireUser(db);

  if (body.action === "start") {
    const bet = assertBet(body.bet ?? 0, "lasthope");
    const session = openSession(db, user, "lasthope", bet, {});
    const survives = rollStages(randomStream());
    session.state = JSON.stringify({ survives, stage: 0 } satisfies LastHopeState);
    return { sessionId: session.id, bet, stage: 0, balance: user.balance };
  }

  const session = activeSession(db, user, body.sessionId ?? "", "lasthope");
  const state = JSON.parse(session.state) as LastHopeState;

  if (body.action === "advance") {
    const nextStage = state.stage + 1;
    if (nextStage > MAX_STAGE) throw new DemoError("Kaikki vaiheet on jo selvitetty.");

    if (!state.survives[nextStage - 1]) {
      const closed = closeSession(db, user, session, {
        payout: 0,
        multiplier: 0,
        status: "BUSTED",
      });
      return {
        survived: false as const,
        stage: nextStage,
        stageName: LAST_HOPE_STAGES[nextStage - 1].name,
        ...closed,
      };
    }

    const multiplier = stageMultiplier(nextStage);

    if (nextStage === MAX_STAGE) {
      const payout = Math.floor(session.bet * multiplier);
      const closed = closeSession(db, user, session, {
        payout,
        multiplier,
        status: "CASHED_OUT",
        achievements: [{ slug: "last-stand", value: 1, mode: "increment" }],
        activityLabel: `selvitti Last Hopen ja voitti ${formatCoins(payout - session.bet)} coins`,
      });
      return {
        survived: true as const,
        cleared: true as const,
        stage: nextStage,
        stageName: LAST_HOPE_STAGES[nextStage - 1].name,
        multiplier,
        payout,
        profit: payout - session.bet,
        ...closed,
      };
    }

    session.state = JSON.stringify({ ...state, stage: nextStage } satisfies LastHopeState);

    return {
      survived: true as const,
      cleared: false as const,
      stage: nextStage,
      stageName: LAST_HOPE_STAGES[nextStage - 1].name,
      multiplier,
      potential: Math.floor(session.bet * multiplier),
      nextMultiplier: stageMultiplier(nextStage + 1),
    };
  }

  // cashout
  if (state.stage < 1) throw new DemoError("Selvitä ensin vähintään yksi vaihe.");
  const multiplier = stageMultiplier(state.stage);
  const payout = Math.floor(session.bet * multiplier);

  const closed = closeSession(db, user, session, {
    payout,
    multiplier,
    status: "CASHED_OUT",
    activityLabel: `voitti ${formatCoins(payout - session.bet)} coins Last Hopessa`,
  });

  return {
    stage: state.stage,
    multiplier,
    payout,
    profit: payout - session.bet,
    ...closed,
  };
}

/* ------------------------------ mob grinder ------------------------------- */

function publicSpawns(state: GrinderState) {
  return state.spawns.map((spawn) => ({
    id: spawn.id,
    kind: spawn.kind,
    hp: spawn.hp,
    maxHp: spawn.maxHp,
    reward: spawn.reward,
    spawnAt: spawn.spawnAt,
    despawnAt: spawn.despawnAt,
    wave: spawn.wave,
    x: spawn.x,
    y: spawn.y,
  }));
}

export function grinderPost(
  db: DemoDb,
  body: {
    action: string;
    bet?: number;
    sessionId?: string;
    hits?: { mobId: number; count: number }[];
  },
) {
  const user = requireUser(db);

  if (body.action === "start") {
    const bet = assertBet(body.bet ?? 0, "mobgrinder");
    const session = openSession(db, user, "mobgrinder", bet, {}, ROUND_DURATION_MS + 60_000);
    const now = Date.now();
    const state: GrinderState = {
      spawns: buildWaves(randomStream(), bet),
      pot: 0,
      kills: 0,
      combo: 0,
      bestCombo: 0,
      lastKillAt: 0,
      hitBudget: 4,
      lastTickAt: now,
      hitCounter: 0,
      startedAt: now,
    };
    session.state = JSON.stringify(state);

    return {
      sessionId: session.id,
      bet,
      startedAt: now,
      duration: ROUND_DURATION_MS,
      spawns: publicSpawns(state),
      maxPayout: maxPayout(bet),
      balance: user.balance,
    };
  }

  const session = activeSession(db, user, body.sessionId ?? "", "mobgrinder");
  const state = JSON.parse(session.state) as GrinderState;
  const now = Date.now();
  const elapsed = now - state.startedAt;

  if (body.action === "attack") {
    if (elapsed > ROUND_DURATION_MS + 2_000) throw new DemoError("Kierros on päättynyt.");

    // Same wall-clock attack budget as the server: a burst is fine, a click
    // storm is not.
    state.hitBudget = Math.min(
      HIT_BURST,
      state.hitBudget + (Math.max(0, now - state.lastTickAt) / 1000) * MAX_HITS_PER_SECOND,
    );
    state.lastTickAt = now;

    const events: {
      mobId: number;
      damage: number;
      crit: boolean;
      killed: boolean;
      reward: number;
      combo: number;
      hp: number;
    }[] = [];
    let ignored = 0;

    for (const hit of body.hits ?? []) {
      const spawn = state.spawns.find((entry) => entry.id === hit.mobId);
      if (!spawn) {
        ignored += hit.count;
        continue;
      }

      for (let i = 0; i < hit.count; i += 1) {
        if (state.hitBudget < 1) {
          ignored += 1;
          continue;
        }
        if (spawn.hp <= 0 || elapsed < spawn.spawnAt || elapsed > spawn.despawnAt) {
          ignored += 1;
          continue;
        }

        state.hitBudget -= 1;
        state.hitCounter += 1;

        const crit = randomFloat() < CRIT_CHANCE;
        const damage = Math.round(PLAYER_DAMAGE * (crit ? CRIT_MULTIPLIER : 1));

        spawn.hp = Math.max(0, spawn.hp - damage);
        const killed = spawn.hp === 0;
        let reward = 0;

        if (killed) {
          const inCombo = now - state.lastKillAt <= COMBO_WINDOW_MS;
          state.combo = inCombo ? state.combo + 1 : 1;
          state.bestCombo = Math.max(state.bestCombo, state.combo);
          state.lastKillAt = now;
          state.kills += 1;
          reward = Math.round(spawn.reward * comboMultiplier(state.combo));
          state.pot = Math.min(maxPayout(session.bet), state.pot + reward);
        }

        events.push({
          mobId: spawn.id,
          damage,
          crit,
          killed,
          reward,
          combo: state.combo,
          hp: spawn.hp,
        });
      }
    }

    if (state.combo > 0 && now - state.lastKillAt > COMBO_WINDOW_MS) state.combo = 0;
    session.state = JSON.stringify(state);

    return {
      events,
      ignored,
      pot: state.pot,
      kills: state.kills,
      combo: state.combo,
      bestCombo: state.bestCombo,
      comboMultiplier: comboMultiplier(state.combo),
      remaining: Math.max(0, ROUND_DURATION_MS - elapsed),
    };
  }

  // finish
  const payout = Math.min(maxPayout(session.bet), Math.trunc(state.pot));
  const multiplier = session.bet > 0 ? payout / session.bet : 0;
  const profit = payout - session.bet;

  const rareKills = state.spawns.filter((spawn) => {
    const kind = MOB_BY_KEY.get(spawn.kind);
    return spawn.hp === 0 && kind && ["EPIC", "LEGENDARY", "MYTHIC"].includes(kind.rarity);
  }).length;

  const closed = closeSession(db, user, session, {
    payout,
    multiplier: Math.round(multiplier * 10_000) / 10_000,
    status: payout > 0 ? "CASHED_OUT" : "BUSTED",
    stats: { mobsDefeated: state.kills, bestCombo: state.bestCombo },
    achievements: [{ slug: "grinder", value: state.kills, mode: "increment" }],
    activityLabel: `kaatoi ${state.kills} mobia ja voitti ${formatCoins(profit)} coins`,
  });

  return {
    payout,
    profit,
    kills: state.kills,
    bestCombo: state.bestCombo,
    rareKills,
    multiplier,
    ...closed,
  };
}
