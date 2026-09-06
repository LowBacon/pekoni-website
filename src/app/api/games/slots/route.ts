import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { settleInstantRound } from "@/server/games/engine";
import { assertBet } from "@/lib/games/config";
import { spinSlots } from "@/lib/games/slots";
import { formatCoins } from "@/lib/format";

const schema = z.object({
  bet: z.number(),
  idempotencyKey: z.string().min(8).max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`slots:${user.id}`, LIMITS.game);

    const input = await parseBody(request, schema);
    const bet = assertBet(input.bet, "slots");

    const result = await settleInstantRound({
      userId: user.id,
      game: "slots",
      bet,
      idempotencyKey: input.idempotencyKey,
      resolve: (rng, ctx) => {
        const spin = spinSlots(rng, ctx.bet);
        return {
          payout: spin.payout,
          multiplier: spin.multiplier,
          result: { grid: spin.grid, wins: spin.wins },
          achievements: [{ slug: "first-spin", value: 1, mode: "increment" as const }],
          activityLabel: `voitti ${formatCoins(spin.payout - ctx.bet)} coins Slotsissa`,
        };
      },
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
