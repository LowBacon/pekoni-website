import "server-only";
import { prisma, type Tx } from "./db";
import { fairStream } from "./rng";
import { applyLedgerEntry } from "./wallet";
import {
  awardXp,
  pushActivity,
  pushNotification,
  recordAchievementProgress,
  updateStats,
} from "./progression";
import { XP_RULES } from "@/lib/progression";
import { drawItem } from "./cases";
import { type BattleMode } from "@/lib/enums";
import {
  BATTLE_COUNTDOWN_MS,
  battleTimings,
  BOT_NAMES,
  revealedRounds,
} from "@/lib/battles";

/**
 * Case battles.
 *
 * All rounds are drawn the instant the lobby fills, then released to clients on
 * a shared clock so every participant sees the same item at the same moment.
 * The API never returns a round that has not been reached yet, so there is
 * nothing to peek at.
 *
 * Economy: bots are funded by whoever adds them — the creator pays one entry per
 * bot slot. Coins in therefore always equal (participants × entry), and coins
 * out equal the summed item values, which sit at the case's expected value. A
 * battle is exactly as expensive as opening the same cases alone; only the
 * variance changes.
 */

// Rules, timings and the bot roster live in src/lib/battles.ts so the client and
// the static build settle against exactly the same clock.
export {
  ALLOWED_SLOTS,
  BATTLE_COUNTDOWN_MS,
  battleTimings,
  MAX_ROUNDS,
  revealedRounds,
  ROUND_REVEAL_MS,
  validateBattleInput,
} from "@/lib/battles";

export async function createBattle(input: {
  userId: string;
  caseId: string;
  rounds: number;
  slots: number;
  mode: BattleMode;
  bots: number;
}) {
  return prisma.$transaction(
    async (tx) => {
      const theCase = await tx.case.findUnique({
        where: { id: input.caseId },
        include: { items: true },
      });
      if (!theCase || !theCase.active || theCase.kind === "DAILY") {
        throw new Error("Casea ei löytynyt.");
      }

      const entryCost = theCase.price * input.rounds;
      // The creator funds their own seat plus every bot seat they add.
      const seatsToPay = 1 + input.bots;

      await applyLedgerEntry(tx, input.userId, {
        type: "BATTLE_ENTRY",
        amount: entryCost * seatsToPay,
        source: `battle:${theCase.slug}`,
        metadata: { rounds: input.rounds, seats: seatsToPay },
      });

      const battle = await tx.caseBattle.create({
        data: {
          caseId: theCase.id,
          creatorId: input.userId,
          mode: input.mode,
          rounds: input.rounds,
          slots: input.slots,
          entryCost,
        },
      });

      await tx.battleParticipant.create({
        data: { battleId: battle.id, userId: input.userId, slot: 0, team: 0 },
      });

      const botSeed = fairStream(battle.id, "bots", 0);
      for (let i = 0; i < input.bots; i += 1) {
        const name = BOT_NAMES[Math.floor(botSeed.next() * BOT_NAMES.length)];
        await tx.battleParticipant.create({
          data: {
            battleId: battle.id,
            botName: `${name}`,
            slot: i + 1,
            team: (i + 1) % 2,
          },
        });
      }

      const filled = 1 + input.bots;
      if (filled >= input.slots) {
        await resolveBattle(tx, battle.id);
      }

      return battle.id;
    },
    { timeout: 20_000 },
  );
}

export async function joinBattle(userId: string, battleId: string) {
  return prisma.$transaction(
    async (tx) => {
      const battle = await tx.caseBattle.findUnique({
        where: { id: battleId },
        include: { participants: true, case: true },
      });
      if (!battle) throw new Error("Battlea ei löytynyt.");
      if (battle.status !== "WAITING") throw new Error("Battle on jo alkanut.");
      if (battle.participants.some((p) => p.userId === userId)) {
        throw new Error("Olet jo mukana tässä battlessa.");
      }
      if (battle.participants.length >= battle.slots) throw new Error("Battle on täynnä.");

      await applyLedgerEntry(tx, userId, {
        type: "BATTLE_ENTRY",
        amount: battle.entryCost,
        source: `battle:${battle.case.slug}`,
        metadata: { battleId },
      });

      const taken = new Set(battle.participants.map((p) => p.slot));
      let slot = 0;
      while (taken.has(slot)) slot += 1;

      await tx.battleParticipant.create({
        data: { battleId, userId, slot, team: slot % 2 },
      });

      if (battle.participants.length + 1 >= battle.slots) {
        await resolveBattle(tx, battleId);
      }

      return battleId;
    },
    { timeout: 20_000 },
  );
}

/**
 * Draws every round for every seat, decides the winner, and pays out. Called the
 * moment the lobby fills — the reveal schedule is purely presentational.
 */
async function resolveBattle(tx: Tx, battleId: string) {
  const battle = await tx.caseBattle.findUniqueOrThrow({
    where: { id: battleId },
    include: { participants: true, case: { include: { items: true } } },
  });
  if (battle.status !== "WAITING") return;

  const stream = fairStream(battle.id, battle.creatorId, battle.participants.length);
  const totals = new Map<string, number>();
  let prizePool = 0;

  for (let round = 1; round <= battle.rounds; round += 1) {
    for (const participant of battle.participants) {
      const item = drawItem(battle.case.items, stream.next());
      await tx.battleRound.create({
        data: {
          battleId: battle.id,
          participantId: participant.id,
          roundNumber: round,
          itemId: item.id,
          value: item.value,
        },
      });
      totals.set(participant.id, (totals.get(participant.id) ?? 0) + item.value);
      prizePool += item.value;
    }
  }

  for (const participant of battle.participants) {
    await tx.battleParticipant.update({
      where: { id: participant.id },
      data: { total: totals.get(participant.id) ?? 0 },
    });
  }

  // Winner selection per mode.
  let winners: typeof battle.participants = [];
  if (battle.mode === "TEAM") {
    const teamTotals = new Map<number, number>();
    for (const p of battle.participants) {
      teamTotals.set(p.team, (teamTotals.get(p.team) ?? 0) + (totals.get(p.id) ?? 0));
    }
    const best = [...teamTotals.entries()].sort((a, b) => b[1] - a[1])[0][0];
    winners = battle.participants.filter((p) => p.team === best);
  } else {
    const sorted = [...battle.participants].sort((a, b) => {
      const at = totals.get(a.id) ?? 0;
      const bt = totals.get(b.id) ?? 0;
      return battle.mode === "CRAZY" ? at - bt : bt - at;
    });
    const bestTotal = totals.get(sorted[0].id) ?? 0;
    winners = sorted.filter((p) => (totals.get(p.id) ?? 0) === bestTotal);
  }

  const share = Math.floor(prizePool / Math.max(1, winners.length));

  for (const winner of winners) {
    await tx.battleParticipant.update({
      where: { id: winner.id },
      data: { isWinner: true, payout: winner.userId ? share : 0 },
    });
  }

  await tx.caseBattle.update({
    where: { id: battleId },
    data: {
      status: "RUNNING",
      prizePool,
      winnerId: winners[0]?.userId ?? null,
      startsAt: new Date(Date.now() + BATTLE_COUNTDOWN_MS),
    },
  });
}

/**
 * Pays out a battle whose reveal has finished. Idempotent, and safe to call from
 * any read path — battles settle as soon as anyone looks at them.
 */
export async function settleFinishedBattles(): Promise<void> {
  const cutoff = new Date();
  const running = await prisma.caseBattle.findMany({
    where: { status: "RUNNING", startsAt: { not: null } },
    include: { participants: true, case: true },
  });

  for (const battle of running) {
    const { finishesAt } = battleTimings(battle.rounds, battle.startsAt);
    if (!finishesAt || finishesAt > cutoff.getTime()) continue;

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.caseBattle.findUnique({ where: { id: battle.id } });
      if (!fresh || fresh.status !== "RUNNING") return; // another request won the race

      await tx.caseBattle.update({
        where: { id: battle.id },
        data: { status: "FINISHED", finishedAt: new Date() },
      });

      for (const participant of battle.participants) {
        if (!participant.userId) continue;

        await updateStats(tx, participant.userId, {
          battlesPlayed: 1,
          battlesWon: participant.isWinner ? 1 : 0,
          totalWagered: battle.entryCost,
          totalWon: participant.payout,
          biggestWin: Math.max(0, participant.payout - battle.entryCost),
        });

        if (participant.isWinner && participant.payout > 0) {
          await applyLedgerEntry(tx, participant.userId, {
            type: "BATTLE_WIN",
            amount: participant.payout,
            source: `battle:${battle.case.slug}`,
            gameId: battle.id,
            metadata: { battleId: battle.id, mode: battle.mode },
          });
          await pushNotification(tx, participant.userId, {
            kind: "SUCCESS",
            title: "Battle voitettu",
            body: `+${participant.payout} coins`,
            href: `/battles?id=${battle.id}`,
          });
          await pushActivity(tx, participant.userId, {
            kind: "BATTLE_WIN",
            label: `voitti ${battle.case.name} -battlen`,
            amount: participant.payout,
          });
          await recordAchievementProgress(tx, participant.userId, [
            { slug: "battle-champion", value: 1, mode: "increment" },
          ]);
        }

        await awardXp(tx, participant.userId, XP_RULES.battle);
      }
    });
  }
}

/** Cancels lobbies that never filled and refunds every seat that was paid for. */
export async function expireStaleBattles(): Promise<void> {
  const cutoff = new Date(Date.now() - 20 * 60 * 1000);
  const stale = await prisma.caseBattle.findMany({
    where: { status: "WAITING", createdAt: { lt: cutoff } },
    include: { participants: true },
  });

  for (const battle of stale) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.caseBattle.findUnique({ where: { id: battle.id } });
      if (!fresh || fresh.status !== "WAITING") return;

      await tx.caseBattle.update({
        where: { id: battle.id },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });

      const botCount = battle.participants.filter((p) => !p.userId).length;
      for (const participant of battle.participants) {
        if (!participant.userId) continue;
        // The creator also gets back whatever they paid for the bot seats.
        const seats = participant.userId === battle.creatorId ? 1 + botCount : 1;
        await applyLedgerEntry(tx, participant.userId, {
          type: "BATTLE_WIN",
          amount: battle.entryCost * seats,
          source: "battle:refund",
          gameId: battle.id,
          metadata: { refund: true, seats },
        });
        await pushNotification(tx, participant.userId, {
          kind: "INFO",
          title: "Battle peruttiin",
          body: `Osallistumismaksu ${battle.entryCost * seats} coins palautettiin.`,
          href: "/battles",
        });
      }
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Read model                                                                 */
/* -------------------------------------------------------------------------- */

export type BattleView = Awaited<ReturnType<typeof getBattleView>>;

/**
 * Serialises a battle for the client, releasing rounds only as the shared clock
 * reaches them. Totals are recomputed from the released rounds, so nothing in
 * the payload gives away a result the player has not watched yet.
 */
export async function getBattleView(battleId: string) {
  const battle = await prisma.caseBattle.findUnique({
    where: { id: battleId },
    include: {
      case: { select: { id: true, slug: true, name: true, price: true, theme: true } },
      creator: { select: { username: true } },
      participants: {
        orderBy: { slot: "asc" },
        include: { user: { select: { id: true, username: true, minecraftUsername: true, xp: true } } },
      },
      battleRounds: { include: { item: true }, orderBy: { roundNumber: "asc" } },
    },
  });
  if (!battle) return null;

  const now = Date.now();
  const released = revealedRounds(battle.rounds, battle.startsAt, now);
  const finished = battle.status === "FINISHED" || battle.status === "CANCELLED";
  const visibleRounds = finished ? battle.rounds : released;

  const rounds = battle.battleRounds
    .filter((round) => round.roundNumber <= visibleRounds)
    .map((round) => ({
      roundNumber: round.roundNumber,
      participantId: round.participantId,
      item: {
        id: round.item.id,
        name: round.item.name,
        rarity: round.item.rarity,
        icon: round.item.icon,
        value: round.value,
      },
    }));

  const totals = new Map<string, number>();
  for (const round of rounds) {
    totals.set(round.participantId, (totals.get(round.participantId) ?? 0) + round.item.value);
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
    createdAt: battle.createdAt.toISOString(),
    creator: battle.creator.username,
    case: battle.case,
    startsAt,
    finishesAt,
    revealedRounds: visibleRounds,
    participants: battle.participants.map((participant) => ({
      id: participant.id,
      slot: participant.slot,
      team: participant.team,
      isBot: !participant.userId,
      userId: participant.userId,
      username: participant.user?.username ?? participant.botName ?? "Botti",
      minecraftUsername: participant.user?.minecraftUsername ?? null,
      total: totals.get(participant.id) ?? 0,
      payout: finished ? participant.payout : null,
      isWinner: finished ? participant.isWinner : null,
    })),
    draws: rounds,
  };
}

/** Lobby list — waiting battles first, then whatever is currently running. */
export async function listBattles(limit = 24) {
  await Promise.all([settleFinishedBattles(), expireStaleBattles()]).catch(() => undefined);

  const battles = await prisma.caseBattle.findMany({
    where: { status: { in: ["WAITING", "RUNNING"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      case: { select: { slug: true, name: true, price: true, theme: true } },
      participants: {
        orderBy: { slot: "asc" },
        include: { user: { select: { username: true, minecraftUsername: true } } },
      },
    },
  });

  return battles.map((battle) => ({
    id: battle.id,
    mode: battle.mode,
    status: battle.status,
    rounds: battle.rounds,
    slots: battle.slots,
    entryCost: battle.entryCost,
    case: battle.case,
    createdAt: battle.createdAt.toISOString(),
    participants: battle.participants.map((participant) => ({
      slot: participant.slot,
      isBot: !participant.userId,
      username: participant.user?.username ?? participant.botName ?? "Botti",
      minecraftUsername: participant.user?.minecraftUsername ?? null,
    })),
  }));
}

/** Recently decided battles, for the results rail. */
export async function recentBattles(limit = 8) {
  const battles = await prisma.caseBattle.findMany({
    where: { status: "FINISHED" },
    orderBy: { finishedAt: "desc" },
    take: limit,
    include: {
      case: { select: { name: true, slug: true, theme: true } },
      participants: {
        where: { isWinner: true },
        include: { user: { select: { username: true, minecraftUsername: true } } },
      },
    },
  });

  return battles.map((battle) => ({
    id: battle.id,
    mode: battle.mode,
    caseName: battle.case.name,
    theme: battle.case.theme,
    prizePool: battle.prizePool,
    finishedAt: battle.finishedAt?.toISOString() ?? null,
    winners: battle.participants.map((participant) => ({
      username: participant.user?.username ?? participant.botName ?? "Botti",
      minecraftUsername: participant.user?.minecraftUsername ?? null,
      payout: participant.payout,
    })),
  }));
}
