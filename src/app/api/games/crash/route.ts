import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { prisma } from "@/server/db";
import { fairStream, hashSeed } from "@/server/rng";
import { closeGameSession, loadActiveSession, openGameSession } from "@/server/games/engine";
import { assertBet } from "@/lib/games/config";
import {
  CRASH_GROWTH_PER_SECOND,
  crashPointFrom,
  resolveCashout,
  timeToReach,
  validateAutoCashout,
  type CrashState,
} from "@/lib/games/crash";
import { formatCoins } from "@/lib/format";

/**
 * Crash.
 *
 * The crash point is drawn when the bet is placed and stored server-side; the
 * client only receives `startedAt` and the growth constant so it can draw the
 * same curve. Cash-out is resolved against the server clock, never against a
 * multiplier the client claims to have reached.
 */

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    bet: z.number(),
    autoCashout: z.union([z.number(), z.null()]).optional(),
  }),
  z.object({ action: z.literal("cashout"), sessionId: z.string().min(1) }),
  z.object({ action: z.literal("settle"), sessionId: z.string().min(1) }),
]);

export const dynamic = "force-dynamic";

/**
 * Resumes an ascent that was interrupted (refresh, closed tab). Without this the
 * stake would sit in limbo until the session's TTL expired.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const session = await prisma.gameSession.findFirst({
      where: { userId: user.id, game: "crash", status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    if (!session) return ok({ session: null });

    const state = JSON.parse(session.state) as CrashState;
    return ok({
      session: {
        sessionId: session.id,
        bet: session.bet,
        startedAt: state.startedAt,
        autoCashout: state.autoCashout,
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
      requireRate(`crash-start:${user.id}`, LIMITS.game);
      const bet = assertBet(input.bet, "crash");
      const autoCashout = validateAutoCashout(input.autoCashout ?? null);

      const result = await prisma.$transaction(async (tx) => {
        const stale = await tx.gameSession.findFirst({
          where: { userId: user.id, game: "crash", status: "ACTIVE" },
        });
        if (stale) throw new Error("Sinulla on jo kesken oleva Crash-kierros.");

        const opened = await openGameSession({
          tx,
          userId: user.id,
          game: "crash",
          bet,
          state: {},
          ttlMs: 30 * 60 * 1000,
        });

        const rng = fairStream(opened.serverSeed, opened.clientSeed, opened.nonce);
        const crashPoint = crashPointFrom(rng.next());
        const startedAt = Date.now();

        await tx.gameSession.update({
          where: { id: opened.id },
          data: {
            state: JSON.stringify({ crashPoint, autoCashout, startedAt } satisfies CrashState),
          },
        });

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        return {
          sessionId: opened.id,
          bet,
          startedAt,
          growth: CRASH_GROWTH_PER_SECOND,
          autoCashout,
          balance: wallet.balance,
        };
      });

      return ok(result);
    }

    const manual = input.action === "cashout";
    requireRate(`crash-${input.action}:${user.id}`, LIMITS.tick);

    const result = await prisma.$transaction(async (tx) => {
      const session = await loadActiveSession(tx, user.id, input.sessionId, "crash");
      const state = JSON.parse(session.state) as CrashState;
      const now = Date.now();

      // An auto-cashout target always wins over a late manual click.
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
        // "settle" — the client reports the ascent ended. Verified server-side.
        const resolved = resolveCashout(state, now);
        if (!resolved.busted) {
          return { pending: true as const, crashPoint: null };
        }
        multiplier = state.crashPoint;
        busted = true;
      }

      const payout = busted ? 0 : Math.floor(session.bet * multiplier);
      const profit = payout - session.bet;

      const closed = await closeGameSession({
        tx,
        userId: user.id,
        sessionId: session.id,
        game: "crash",
        bet: session.bet,
        payout,
        multiplier: busted ? 0 : multiplier,
        status: busted ? "BUSTED" : "CASHED_OUT",
        result: {
          crashPoint: state.crashPoint,
          cashedAt: busted ? null : multiplier,
          auto: autoReached,
        },
        serverSeedHash: hashSeed(session.serverSeed),
        clientSeed: session.clientSeed,
        nonce: session.nonce,
        stats: busted ? {} : { highestCrash: multiplier },
        achievements: busted
          ? []
          : [
              ...(multiplier >= 10 ? [{ slug: "diamond-hands", value: 1, mode: "increment" as const }] : []),
              ...(multiplier >= 25 ? [{ slug: "crash-master", value: 1, mode: "increment" as const }] : []),
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
