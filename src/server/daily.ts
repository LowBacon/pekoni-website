import "server-only";
import { prisma } from "./db";
import { fairStream } from "./rng";
import { applyLedgerEntry, claimIdempotencyKey, storeIdempotentResult } from "./wallet";
import { awardXp, pushActivity, recordAchievementProgress, type UnlockedAchievement } from "./progression";
import { XP_RULES } from "@/lib/progression";
import { drawItem, type DrawnItem } from "./cases";

export const DAILY_CASE_SLUG = "daily-case";
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** A streak survives a missed day up to this gap, then resets. */
export const STREAK_WINDOW_MS = 48 * 60 * 60 * 1000;

export type DailyStatus = {
  available: boolean;
  nextAvailableAt: string | null;
  streak: number;
  lastClaimedAt: string | null;
  totalClaimed: number;
};

export async function getDailyStatus(userId: string): Promise<DailyStatus> {
  const [last, total] = await Promise.all([
    prisma.dailyReward.findFirst({
      where: { userId },
      orderBy: { claimedAt: "desc" },
    }),
    prisma.dailyReward.count({ where: { userId } }),
  ]);

  if (!last) {
    return { available: true, nextAvailableAt: null, streak: 0, lastClaimedAt: null, totalClaimed: 0 };
  }

  const nextAt = last.claimedAt.getTime() + DAILY_COOLDOWN_MS;
  const available = Date.now() >= nextAt;
  const streakBroken = Date.now() > last.claimedAt.getTime() + STREAK_WINDOW_MS;

  return {
    available,
    nextAvailableAt: available ? null : new Date(nextAt).toISOString(),
    streak: streakBroken ? 0 : last.streak,
    lastClaimedAt: last.claimedAt.toISOString(),
    totalClaimed: total,
  };
}

export type DailyClaimResult = {
  balance: number;
  item: DrawnItem;
  amount: number;
  streak: number;
  reel: DrawnItem[];
  winningIndex: number;
  nextAvailableAt: string;
  level: number;
  leveledUp: boolean;
  unlocked: UnlockedAchievement[];
};

const REEL_LENGTH = 48;
const WINNING_INDEX = 41;

/**
 * The reward is decided on the server before the chest animation starts. The
 * cooldown is enforced inside the same transaction as the payout, so hammering
 * the endpoint cannot produce a second claim.
 */
export async function claimDaily(input: {
  userId: string;
  idempotencyKey?: string;
}): Promise<DailyClaimResult> {
  return prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        const claim = await claimIdempotencyKey(tx, input.idempotencyKey, input.userId, "daily");
        if (!claim.fresh) return claim.result as DailyClaimResult;
      }

      const last = await tx.dailyReward.findFirst({
        where: { userId: input.userId },
        orderBy: { claimedAt: "desc" },
      });

      const now = Date.now();
      if (last && now < last.claimedAt.getTime() + DAILY_COOLDOWN_MS) {
        throw new Error("Daily Case ei ole vielä avattavissa.");
      }

      const theCase = await tx.case.findUnique({
        where: { slug: DAILY_CASE_SLUG },
        include: { items: true },
      });
      if (!theCase || theCase.items.length === 0) throw new Error("Daily Casea ei löytynyt.");

      const user = await tx.user.update({
        where: { id: input.userId },
        data: { nonce: { increment: 1 } },
        select: { serverSeed: true, clientSeed: true, nonce: true },
      });

      const rng = fairStream(user.serverSeed, user.clientSeed, user.nonce);
      const item = drawItem(theCase.items, rng.next());

      const reel: DrawnItem[] = [];
      for (let i = 0; i < REEL_LENGTH; i += 1) {
        reel.push(i === WINNING_INDEX ? item : drawItem(theCase.items, rng.next()));
      }

      const streakContinues = last && now <= last.claimedAt.getTime() + STREAK_WINDOW_MS;
      const streak = streakContinues ? last.streak + 1 : 1;

      await applyLedgerEntry(tx, input.userId, {
        type: "DAILY_REWARD",
        amount: item.value,
        source: "daily-case",
        metadata: { itemId: item.id, rarity: item.rarity, streak },
      });

      await tx.dailyReward.create({
        data: {
          userId: input.userId,
          amount: item.value,
          streak,
          itemName: item.name,
          rarity: item.rarity,
        },
      });

      await tx.caseOpening.create({
        data: {
          userId: input.userId,
          caseId: theCase.id,
          itemId: item.id,
          cost: 0,
          value: item.value,
          source: "DAILY",
        },
      });

      const xp = await awardXp(tx, input.userId, XP_RULES.dailyCase);

      const unlocked = await recordAchievementProgress(tx, input.userId, [
        { slug: "og-player", value: streak, mode: "max" },
        ...(item.rarity === "LEGENDARY" || item.rarity === "MYTHIC"
          ? [{ slug: "lucky", value: 1, mode: "increment" as const }]
          : []),
      ]);

      await pushActivity(tx, input.userId, {
        kind: "CASE_OPEN",
        label: `avasi Daily Casen — ${item.name}`,
        amount: item.value,
        rarity: item.rarity,
      });

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });

      const response: DailyClaimResult = {
        balance: wallet.balance,
        item,
        amount: item.value,
        streak,
        reel,
        winningIndex: WINNING_INDEX,
        nextAvailableAt: new Date(now + DAILY_COOLDOWN_MS).toISOString(),
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
