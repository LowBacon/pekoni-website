import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { prisma } from "@/server/db";
import { fairStream, hashSeed } from "@/server/rng";
import { closeGameSession, loadActiveSession, openGameSession } from "@/server/games/engine";
import { assertBet } from "@/lib/games/config";
import {
  LAST_HOPE_STAGES,
  MAX_STAGE,
  rollStages,
  stageMultiplier,
  type LastHopeState,
} from "@/lib/games/lasthope";
import { formatCoins } from "@/lib/format";

/**
 * Last Hope. Every stage outcome is rolled when the round opens, so how long the
 * player hesitates cannot change what happens next.
 */

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), bet: z.number() }),
  z.object({ action: z.literal("advance"), sessionId: z.string().min(1) }),
  z.object({ action: z.literal("cashout"), sessionId: z.string().min(1) }),
]);

export async function GET() {
  try {
    const user = await requireUser();
    const session = await prisma.gameSession.findFirst({
      where: { userId: user.id, game: "lasthope", status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    if (!session) return ok({ session: null });

    const state = JSON.parse(session.state) as LastHopeState;
    return ok({
      session: {
        sessionId: session.id,
        bet: session.bet,
        stage: state.stage,
        multiplier: stageMultiplier(state.stage),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, schema);

    if (input.action === "start") {
      requireRate(`lasthope-start:${user.id}`, LIMITS.game);
      const bet = assertBet(input.bet, "lasthope");

      const result = await prisma.$transaction(async (tx) => {
        const stale = await tx.gameSession.findFirst({
          where: { userId: user.id, game: "lasthope", status: "ACTIVE" },
        });
        if (stale) throw new Error("Sinulla on jo kesken oleva Last Hope -kierros.");

        const opened = await openGameSession({
          tx,
          userId: user.id,
          game: "lasthope",
          bet,
          state: {},
        });

        const rng = fairStream(opened.serverSeed, opened.clientSeed, opened.nonce);
        const survives = rollStages(rng);

        await tx.gameSession.update({
          where: { id: opened.id },
          data: { state: JSON.stringify({ survives, stage: 0 } satisfies LastHopeState) },
        });

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        return { sessionId: opened.id, bet, stage: 0, balance: wallet.balance };
      });

      return ok(result);
    }

    if (input.action === "advance") {
      requireRate(`lasthope-advance:${user.id}`, LIMITS.tick);

      const result = await prisma.$transaction(async (tx) => {
        const session = await loadActiveSession(tx, user.id, input.sessionId, "lasthope");
        const state = JSON.parse(session.state) as LastHopeState;
        const nextStage = state.stage + 1;
        if (nextStage > MAX_STAGE) throw new Error("Kaikki vaiheet on jo selvitetty.");

        const survived = state.survives[nextStage - 1];

        if (!survived) {
          const closed = await closeGameSession({
            tx,
            userId: user.id,
            sessionId: session.id,
            game: "lasthope",
            bet: session.bet,
            payout: 0,
            multiplier: 0,
            status: "BUSTED",
            result: { stage: nextStage, survived: false, survives: state.survives },
            serverSeedHash: hashSeed(session.serverSeed),
            clientSeed: session.clientSeed,
            nonce: session.nonce,
          });
          return {
            survived: false as const,
            stage: nextStage,
            stageName: LAST_HOPE_STAGES[nextStage - 1].name,
            balance: closed.balance,
            level: closed.level,
            leveledUp: closed.leveledUp,
            unlocked: closed.unlocked,
          };
        }

        const multiplier = stageMultiplier(nextStage);
        const finalStage = nextStage === MAX_STAGE;

        if (finalStage) {
          // Clearing the shrine pays out automatically — there is nothing left to risk.
          const payout = Math.floor(session.bet * multiplier);
          const closed = await closeGameSession({
            tx,
            userId: user.id,
            sessionId: session.id,
            game: "lasthope",
            bet: session.bet,
            payout,
            multiplier,
            status: "CASHED_OUT",
            result: { stage: nextStage, survived: true, cleared: true, multiplier },
            serverSeedHash: hashSeed(session.serverSeed),
            clientSeed: session.clientSeed,
            nonce: session.nonce,
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
            balance: closed.balance,
            level: closed.level,
            leveledUp: closed.leveledUp,
            unlocked: closed.unlocked,
          };
        }

        await tx.gameSession.update({
          where: { id: session.id },
          data: { state: JSON.stringify({ ...state, stage: nextStage } satisfies LastHopeState) },
        });

        return {
          survived: true as const,
          cleared: false as const,
          stage: nextStage,
          stageName: LAST_HOPE_STAGES[nextStage - 1].name,
          multiplier,
          potential: Math.floor(session.bet * multiplier),
          nextMultiplier: stageMultiplier(nextStage + 1),
        };
      });

      return ok(result);
    }

    requireRate(`lasthope-cashout:${user.id}`, LIMITS.game);

    const result = await prisma.$transaction(async (tx) => {
      const session = await loadActiveSession(tx, user.id, input.sessionId, "lasthope");
      const state = JSON.parse(session.state) as LastHopeState;
      if (state.stage < 1) throw new Error("Selvitä ensin vähintään yksi vaihe.");

      const multiplier = stageMultiplier(state.stage);
      const payout = Math.floor(session.bet * multiplier);

      const closed = await closeGameSession({
        tx,
        userId: user.id,
        sessionId: session.id,
        game: "lasthope",
        bet: session.bet,
        payout,
        multiplier,
        status: "CASHED_OUT",
        result: { stage: state.stage, multiplier, cashedOut: true },
        serverSeedHash: hashSeed(session.serverSeed),
        clientSeed: session.clientSeed,
        nonce: session.nonce,
        activityLabel: `voitti ${formatCoins(payout - session.bet)} coins Last Hopessa`,
      });

      return {
        stage: state.stage,
        multiplier,
        payout,
        profit: payout - session.bet,
        balance: closed.balance,
        level: closed.level,
        leveledUp: closed.leveledUp,
        unlocked: closed.unlocked,
      };
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
