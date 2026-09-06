import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { prisma } from "@/server/db";
import { fairFloat, fairStream, hashSeed } from "@/server/rng";
import { closeGameSession, loadActiveSession, openGameSession } from "@/server/games/engine";
import { assertBet } from "@/lib/games/config";
import {
  buildWaves,
  comboMultiplier,
  COMBO_WINDOW_MS,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  MOB_BY_KEY,
  PLAYER_DAMAGE,
  refillBudget,
  ROUND_DURATION_MS,
  maxPayout,
  type GrinderState,
} from "@/lib/games/mobgrinder";
import { formatCoins } from "@/lib/format";

/**
 * Mob Grinder.
 *
 * The client renders and reports intent; the server owns every hit point, every
 * crit roll and every coin. Attacks arrive in small batches and are metered
 * against a wall-clock budget, so a script cannot out-click the round.
 */

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), bet: z.number() }),
  z.object({
    action: z.literal("attack"),
    sessionId: z.string().min(1),
    hits: z
      .array(z.object({ mobId: z.number().int().min(0), count: z.number().int().min(1).max(12) }))
      .max(12),
  }),
  z.object({ action: z.literal("finish"), sessionId: z.string().min(1) }),
]);

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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, schema);

    if (input.action === "start") {
      requireRate(`grinder-start:${user.id}`, LIMITS.game);
      const bet = assertBet(input.bet, "mobgrinder");

      const result = await prisma.$transaction(async (tx) => {
        const stale = await tx.gameSession.findFirst({
          where: { userId: user.id, game: "mobgrinder", status: "ACTIVE" },
        });
        if (stale) throw new Error("Sinulla on jo kesken oleva Mob Grinder -kierros.");

        const opened = await openGameSession({
          tx,
          userId: user.id,
          game: "mobgrinder",
          bet,
          state: {},
          ttlMs: ROUND_DURATION_MS + 60_000,
        });

        const rng = fairStream(opened.serverSeed, opened.clientSeed, opened.nonce);
        const now = Date.now();
        const state: GrinderState = {
          spawns: buildWaves(rng, bet),
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

        await tx.gameSession.update({
          where: { id: opened.id },
          data: { state: JSON.stringify(state) },
        });

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: user.id } });
        return {
          sessionId: opened.id,
          bet,
          startedAt: now,
          duration: ROUND_DURATION_MS,
          spawns: publicSpawns(state),
          maxPayout: maxPayout(bet),
          balance: wallet.balance,
        };
      });

      return ok(result);
    }

    if (input.action === "attack") {
      requireRate(`grinder-attack:${user.id}`, LIMITS.tick);

      const result = await prisma.$transaction(async (tx) => {
        const session = await loadActiveSession(tx, user.id, input.sessionId, "mobgrinder");
        const state = JSON.parse(session.state) as GrinderState;
        const now = Date.now();
        const elapsed = now - state.startedAt;

        if (elapsed > ROUND_DURATION_MS + 2_000) {
          throw new Error("Kierros on päättynyt.");
        }

        refillBudget(state, now);

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

        for (const hit of input.hits) {
          const spawn = state.spawns.find((s) => s.id === hit.mobId);
          if (!spawn) {
            ignored += hit.count;
            continue;
          }

          for (let i = 0; i < hit.count; i += 1) {
            if (state.hitBudget < 1) {
              ignored += 1;
              continue;
            }
            // The mob must actually be on screen right now.
            if (spawn.hp <= 0 || elapsed < spawn.spawnAt || elapsed > spawn.despawnAt) {
              ignored += 1;
              continue;
            }

            state.hitBudget -= 1;
            state.hitCounter += 1;

            const critRoll = fairFloat(
              session.serverSeed,
              session.clientSeed,
              session.nonce,
              10_000 + state.hitCounter,
            );
            const crit = critRoll < CRIT_CHANCE;
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

        // A long silence breaks the combo even without a miss.
        if (state.combo > 0 && now - state.lastKillAt > COMBO_WINDOW_MS) state.combo = 0;

        await tx.gameSession.update({
          where: { id: session.id },
          data: { state: JSON.stringify(state) },
        });

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
      });

      return ok(result);
    }

    requireRate(`grinder-finish:${user.id}`, LIMITS.game);

    const result = await prisma.$transaction(async (tx) => {
      const session = await loadActiveSession(tx, user.id, input.sessionId, "mobgrinder");
      const state = JSON.parse(session.state) as GrinderState;
      const payout = Math.min(maxPayout(session.bet), Math.trunc(state.pot));
      const multiplier = session.bet > 0 ? payout / session.bet : 0;
      const profit = payout - session.bet;

      const rareKills = state.spawns.filter((spawn) => {
        const kind = MOB_BY_KEY.get(spawn.kind);
        return spawn.hp === 0 && kind && ["EPIC", "LEGENDARY", "MYTHIC"].includes(kind.rarity);
      }).length;

      const closed = await closeGameSession({
        tx,
        userId: user.id,
        sessionId: session.id,
        game: "mobgrinder",
        bet: session.bet,
        payout,
        multiplier: Math.round(multiplier * 10_000) / 10_000,
        status: payout > 0 ? "CASHED_OUT" : "BUSTED",
        result: { kills: state.kills, bestCombo: state.bestCombo, rareKills, pot: payout },
        serverSeedHash: hashSeed(session.serverSeed),
        clientSeed: session.clientSeed,
        nonce: session.nonce,
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
