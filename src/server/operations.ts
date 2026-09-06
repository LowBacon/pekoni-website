import "server-only";
import { type Tx } from "./db";
import { LimitError } from "./limits";
export async function assertGameAvailable(tx: Tx, game: string, bet: number) {
  const state = await tx.platformState.findUnique({ where: { id: "platform" } });
  if (state?.maintenance) throw new LimitError(state.notice || "Games are paused for maintenance.", "MAINTENANCE", 503);
  const config = await tx.gameConfig.findUnique({ where: { game } });
  if (config && (!config.enabled || bet < config.minBet || bet > config.maxBet))
    throw new LimitError(`Game unavailable or wager outside ${config.minBet}–${config.maxBet} coins.`, "GAME_CONFIG", 409);
}
