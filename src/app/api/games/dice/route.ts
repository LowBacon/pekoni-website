import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { settleInstantRound } from "@/server/games/engine";
import { assertBet } from "@/lib/games/config";
import { rollDice, validateDice } from "@/lib/games/dice";
import { formatCoins } from "@/lib/format";

const schema = z.object({
  bet: z.number(),
  target: z.number(),
  direction: z.string(),
  idempotencyKey: z.string().min(8).max(64).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`dice:${user.id}`, LIMITS.game);

    const input = await parseBody(request, schema);
    const bet = assertBet(input.bet, "dice");
    const { target, direction } = validateDice(input.target, input.direction);

    const result = await settleInstantRound({
      userId: user.id,
      game: "dice",
      bet,
      idempotencyKey: input.idempotencyKey,
      resolve: (rng, ctx) => {
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
      },
    });

    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
