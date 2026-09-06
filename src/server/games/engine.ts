import "server-only";
import { prisma, type Tx } from "../db";
import { fairStream } from "../rng";
import { applyLedgerEntry, claimIdempotencyKey, storeIdempotentResult } from "../wallet";
import { publishSettlement } from "../results";
import { assertGameAvailable } from "../operations";
import { assertCanWager } from "../limits";
import {
  awardXp,
  pushActivity,
  recordAchievementProgress,
  updateStats,
  type AchievementUpdate,
  type StatDelta,
  type UnlockedAchievement,
} from "../progression";
import { XP_RULES } from "@/lib/progression";
import type { GameKey } from "@/lib/enums";
import type { FairStream } from "@/lib/games/types";

export type { FairStream } from "@/lib/games/types";

export type RoundResolution = {
  payout: number;
  multiplier: number;
  /** Everything the client is allowed to know once the round is over. */
  result: Record<string, unknown>;
  /** Extra achievement signals from the specific game. */
  achievements?: AchievementUpdate[];
  stats?: StatDelta;
  /** Feed line, e.g. "voitti 2 400 coins Crashissa". Omitted for losses. */
  activityLabel?: string;
};

export type RoundOutcome = {
  balance: number;
  bet: number;
  payout: number;
  profit: number;
  multiplier: number;
  outcome: "WIN" | "LOSS" | "PUSH";
  roundId: string;
  result: Record<string, unknown>;
  fair: { serverSeedHash: string; clientSeed: string; nonce: number };
  level: number;
  leveledUp: boolean;
  unlocked: UnlockedAchievement[];
};

/**
 * The canonical settlement path for every single-request game.
 *
 * 1. authenticate (done by the route) 2. validate 3. replay guard
 * 4. atomic debit 5. server-side seed + result 6. server-side payout
 * 7. atomic credit 8. ledger 9. GameRound 10. stats/XP 11. sanitised response.
 *
 * The `resolve` callback receives only a deterministic RNG stream — it has no
 * access to anything the client sent beyond the validated parameters.
 *
 * Self-imposed limits are checked here rather than in the routes, so a game
 * added later cannot forget to ask.
 */
export async function settleInstantRound(input: {
  userId: string;
  game: GameKey;
  bet: number;
  idempotencyKey?: string;
  resolve: (rng: FairStream, ctx: { bet: number }) => RoundResolution;
}): Promise<RoundOutcome> {
  const { userId, game, bet } = input;

  // Before anything is claimed or debited: a player on a break or over their own
  // cap gets a clear refusal, not a round.


  return prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        const claim = await claimIdempotencyKey(tx, input.idempotencyKey, userId, `game:${game}`);
        if (!claim.fresh) return claim.result as RoundOutcome;
      }

      // Seeds are read and the nonce advanced inside the transaction so two
      // parallel rounds can never share a nonce.
      const user = await tx.user.update({
        where: { id: userId },
        data: { nonce: { increment: 1 } },
        select: { serverSeed: true, serverSeedHash: true, clientSeed: true, nonce: true },
      });

      await assertCanWager(userId, bet, tx);
      await assertGameAvailable(tx, game, bet);
      await applyLedgerEntry(tx, userId, {
        type: "GAME_BET",
        amount: bet,
        source: game,
        metadata: { game },
      });

      const rng = fairStream(user.serverSeed, user.clientSeed, user.nonce);
      const resolution = input.resolve(rng, { bet });

      const payout = Math.max(0, Math.trunc(resolution.payout));
      const outcome: "WIN" | "LOSS" | "PUSH" =
        payout > bet ? "WIN" : payout === bet ? "PUSH" : "LOSS";

      if (payout > 0) {
        await applyLedgerEntry(tx, userId, {
          type: "GAME_WIN",
          amount: payout,
          source: game,
          metadata: { game, multiplier: resolution.multiplier },
        });
      }

      const round = await tx.gameRound.create({
        data: {
          userId,
          game,
          bet,
          payout,
          multiplier: resolution.multiplier,
          outcome,
          serverSeed: user.serverSeedHash,
          clientSeed: user.clientSeed,
          nonce: user.nonce,
          result: JSON.stringify(resolution.result),
        },
        select: { id: true },
      });

      await publishSettlement(tx, round.id);
      const profit = payout - bet;

      await updateStats(tx, userId, {
        gamesPlayed: 1,
        totalWagered: bet,
        totalWon: payout,
        biggestWin: profit > 0 ? profit : 0,
        won: outcome === "WIN",
        ...resolution.stats,
      });

      const xp = await awardXp(
        tx,
        userId,
        XP_RULES.perRound(bet) + (outcome === "WIN" ? XP_RULES.winBonus : 0),
      );

      const unlocked = await recordAchievementProgress(tx, userId, [
        { slug: "first-win", value: outcome === "WIN" ? 1 : 0, mode: "increment" },
        { slug: "high-roller", value: bet, mode: "max" },
        ...(resolution.achievements ?? []),
      ]);

      if (resolution.activityLabel && profit > 0) {
        await pushActivity(tx, userId, {
          kind: "GAME_WIN",
          label: resolution.activityLabel,
          amount: profit,
        });
      }

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

      const response: RoundOutcome = {
        balance: wallet.balance,
        bet,
        payout,
        profit,
        multiplier: resolution.multiplier,
        outcome,
        roundId: round.id,
        result: resolution.result,
        fair: {
          serverSeedHash: user.serverSeedHash,
          clientSeed: user.clientSeed,
          nonce: user.nonce,
        },
        level: xp.level,
        leveledUp: xp.leveledUp,
        unlocked,
      };

      if (input.idempotencyKey) {
        await storeIdempotentResult(tx, input.idempotencyKey, response);
      }

      return response;
    },
    { timeout: 15_000 },
  );
}

/** Shared helper for the multi-step games (mines, crash, last hope, grinder). */
export async function openGameSession(input: {
  tx: Tx;
  userId: string;
  game: GameKey;
  bet: number;
  state: Record<string, unknown>;
  ttlMs?: number;
}): Promise<{ id: string; serverSeed: string; clientSeed: string; nonce: number }> {
  const { tx, userId, game, bet } = input;

  // Multi-step games take the stake here, so this is their wager gate.


  const user = await tx.user.update({
    where: { id: userId },
    data: { nonce: { increment: 1 } },
    select: { serverSeed: true, clientSeed: true, nonce: true },
  });

  await assertCanWager(userId, bet, tx);
  await assertGameAvailable(tx, game, bet);
  await applyLedgerEntry(tx, userId, {
    type: "GAME_BET",
    amount: bet,
    source: game,
    metadata: { game },
  });

  const session = await tx.gameSession.create({
    data: {
      userId,
      game,
      bet,
      activeKey: `${userId}:${game}`,
      state: JSON.stringify(input.state),
      serverSeed: user.serverSeed,
      clientSeed: user.clientSeed,
      nonce: user.nonce,
      expiresAt: new Date(Date.now() + (input.ttlMs ?? 60 * 60 * 1000)),
    },
    select: { id: true },
  });

  return {
    id: session.id,
    serverSeed: user.serverSeed,
    clientSeed: user.clientSeed,
    nonce: user.nonce,
  };
}

/** Closes a session, pays out, and writes the GameRound + stats + XP. */
export async function closeGameSession(input: {
  tx: Tx;
  userId: string;
  sessionId: string;
  game: GameKey;
  bet: number;
  payout: number;
  multiplier: number;
  status: "CASHED_OUT" | "BUSTED";
  result: Record<string, unknown>;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  achievements?: AchievementUpdate[];
  stats?: StatDelta;
  activityLabel?: string;
}): Promise<{ balance: number; level: number; leveledUp: boolean; unlocked: UnlockedAchievement[] }> {
  const { tx, userId, game, bet } = input;
  const payout = Math.max(0, Math.trunc(input.payout));

  const guard = await tx.gameSession.updateMany({
    where: { id: input.sessionId, userId, status: "ACTIVE" },
    data: { status: input.status, activeKey: null },
  });
  if (guard.count !== 1) throw new Error("Peli on jo päättynyt.");
  if (payout > 0) {
    await applyLedgerEntry(tx, userId, {
      type: "GAME_WIN",
      amount: payout,
      source: game,
      gameId: input.sessionId,
      metadata: { game, multiplier: input.multiplier },
    });
  }

  await tx.gameSession.update({
    where: { id: input.sessionId },
    data: {
      status: input.status,
      payout,
      multiplier: input.multiplier,
      endedAt: new Date(),
      state: JSON.stringify(input.result),
    },
  });

  const settledRound = await tx.gameRound.create({
    data: {
      userId,
      game,
      bet,
      payout,
      multiplier: input.multiplier,
      outcome: payout > bet ? "WIN" : payout === bet ? "PUSH" : "LOSS",
      serverSeed: input.serverSeedHash,
      clientSeed: input.clientSeed,
      nonce: input.nonce,
      result: JSON.stringify(input.result),
    },
  });

  await publishSettlement(tx, settledRound.id);
  const profit = payout - bet;

  await updateStats(tx, userId, {
    gamesPlayed: 1,
    totalWagered: bet,
    totalWon: payout,
    biggestWin: profit > 0 ? profit : 0,
    won: payout > bet,
    ...input.stats,
  });

  const xp = await awardXp(
    tx,
    userId,
    XP_RULES.perRound(bet) + (payout > bet ? XP_RULES.winBonus : 0),
  );

  const unlocked = await recordAchievementProgress(tx, userId, [
    { slug: "first-win", value: payout > bet ? 1 : 0, mode: "increment" },
    { slug: "high-roller", value: bet, mode: "max" },
    ...(input.achievements ?? []),
  ]);

  if (input.activityLabel && profit > 0) {
    await pushActivity(tx, userId, {
      kind: "GAME_WIN",
      label: input.activityLabel,
      amount: profit,
    });
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  return { balance: wallet.balance, level: xp.level, leveledUp: xp.leveledUp, unlocked };
}

/** Loads an active session and refuses anything that is not the caller's. */
export async function loadActiveSession(tx: Tx, userId: string, sessionId: string, game: GameKey) {
  await tx.gameSession.updateMany({ where: { id: sessionId, userId, game, status: "ACTIVE" }, data: { revision: { increment: 1 } } });
  const session = await tx.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId || session.game !== game) {
    throw new Error("Peliä ei löytynyt.");
  }
  if (session.status !== "ACTIVE") throw new Error("Peli on jo päättynyt.");
  // Interrupted choice games remain recoverable. Their stake stays reserved until settlement.
  return session;
}
