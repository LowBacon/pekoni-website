import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { prisma } from "@/server/db";
import { fairStream } from "@/server/rng";
import { closeGameSession, loadActiveSession, openGameSession } from "@/server/games/engine";
import { assertBet } from "@/lib/games/config";
import {
  layMines,
  minesMultiplier,
  MINES_TILES,
  validateMineCount,
  validateTileIndex,
  type MinesState,
} from "@/lib/games/mines";
import { formatCoins } from "@/lib/format";
import { hashSeed } from "@/server/rng";

/**
 * Mines is stateful: the bomb layout is fixed when the round opens and lives
 * only in the database. A reveal request returns exactly one tile's outcome, so
 * the client cannot learn the board ahead of time.
 */

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    bet: z.number(),
    mines: z.number(),
  }),
  z.object({
    action: z.literal("reveal"),
    sessionId: z.string().min(1),
    tile: z.number(),
  }),
  z.object({
    action: z.literal("cashout"),
    sessionId: z.string().min(1),
  }),
]);

export async function GET() {
  try {
    const user = await requireUser();
    const session = await prisma.gameSession.findFirst({
      where: { userId: user.id, game: "mines", status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
    });
    if (!session) return ok({ session: null });

    const state = JSON.parse(session.state) as MinesState;
    return ok({
      session: {
        sessionId: session.id,
        bet: session.bet,
        mineCount: state.mineCount,
        revealed: state.revealed,
        multiplier: minesMultiplier(state.mineCount, state.revealed.length),
        profit:
          Math.floor(session.bet * minesMultiplier(state.mineCount, state.revealed.length)) -
          session.bet,
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
      requireRate(`mines-start:${user.id}`, LIMITS.game);
      const bet = assertBet(input.bet, "mines");
      const mineCount = validateMineCount(input.mines);

      const result = await prisma.$transaction(async (tx) => {
        const stale = await tx.gameSession.findFirst({
          where: { userId: user.id, game: "mines", status: "ACTIVE" },
        });
        if (stale) throw new Error("Sinulla on jo kesken oleva Mines-peli.");

        const opened = await openGameSession({
          tx,
          userId: user.id,
          game: "mines",
          bet,
          state: { mines: [], mineCount, revealed: [] },
        });

        const rng = fairStream(opened.serverSeed, opened.clientSeed, opened.nonce);
        const mines = layMines(mineCount, rng);

        await tx.gameSession.update({
          where: { id: opened.id },
          data: { state: JSON.stringify({ mines, mineCount, revealed: [] } satisfies MinesState) },
        });

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        return { sessionId: opened.id, balance: wallet.balance, bet, mineCount };
      });

      return ok(result);
    }

    if (input.action === "reveal") {
      requireRate(`mines-reveal:${user.id}`, LIMITS.tick);
      const tile = validateTileIndex(input.tile);

      const result = await prisma.$transaction(async (tx) => {
        const session = await loadActiveSession(tx, user.id, input.sessionId, "mines");
        const state = JSON.parse(session.state) as MinesState;

        if (state.revealed.includes(tile)) throw new Error("Ruutu on jo avattu.");

        const hitMine = state.mines.includes(tile);

        if (hitMine) {
          const closed = await closeGameSession({
            tx,
            userId: user.id,
            sessionId: session.id,
            game: "mines",
            bet: session.bet,
            payout: 0,
            multiplier: 0,
            status: "BUSTED",
            result: { mines: state.mines, revealed: [...state.revealed, tile], hit: tile },
            serverSeedHash: hashSeed(session.serverSeed),
            clientSeed: session.clientSeed,
            nonce: session.nonce,
          });
          return {
            outcome: "BUSTED" as const,
            tile,
            mines: state.mines,
            revealed: [...state.revealed, tile],
            balance: closed.balance,
            level: closed.level,
            leveledUp: closed.leveledUp,
            unlocked: closed.unlocked,
          };
        }

        const revealed = [...state.revealed, tile];
        await tx.gameSession.update({
          where: { id: session.id },
          data: { state: JSON.stringify({ ...state, revealed } satisfies MinesState) },
        });

        const multiplier = minesMultiplier(state.mineCount, revealed.length);
        const safeTiles = MINES_TILES - state.mineCount;

        return {
          outcome: "SAFE" as const,
          tile,
          revealed,
          multiplier,
          profit: Math.floor(session.bet * multiplier) - session.bet,
          nextMultiplier:
            revealed.length < safeTiles
              ? minesMultiplier(state.mineCount, revealed.length + 1)
              : null,
          allClear: revealed.length === safeTiles,
        };
      });

      return ok(result);
    }

    // cashout
    requireRate(`mines-cashout:${user.id}`, LIMITS.game);

    const result = await prisma.$transaction(async (tx) => {
      const session = await loadActiveSession(tx, user.id, input.sessionId, "mines");
      const state = JSON.parse(session.state) as MinesState;
      if (state.revealed.length === 0) throw new Error("Avaa vähintään yksi ruutu ennen lunastusta.");

      const multiplier = minesMultiplier(state.mineCount, state.revealed.length);
      const payout = Math.floor(session.bet * multiplier);
      const profit = payout - session.bet;

      const closed = await closeGameSession({
        tx,
        userId: user.id,
        sessionId: session.id,
        game: "mines",
        bet: session.bet,
        payout,
        multiplier,
        status: "CASHED_OUT",
        result: { mines: state.mines, revealed: state.revealed, multiplier },
        serverSeedHash: hashSeed(session.serverSeed),
        clientSeed: session.clientSeed,
        nonce: session.nonce,
        stats: { bestMinesMult: multiplier },
        achievements: [
          { slug: "lucky-miner", value: state.revealed.length, mode: "increment" },
          ...(multiplier >= 10 ? [{ slug: "mine-sweeper", value: 1, mode: "increment" as const }] : []),
        ],
        activityLabel: `voitti ${formatCoins(profit)} coins Minesissä`,
      });

      return {
        outcome: "CASHED_OUT" as const,
        payout,
        profit,
        multiplier,
        mines: state.mines,
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
