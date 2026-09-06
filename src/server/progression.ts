import "server-only";
import type { Tx } from "./db";
import { levelFromXp, levelUpCoinReward } from "@/lib/progression";
import { applyLedgerEntry } from "./wallet";
import type { ActivityKind, Rarity } from "@/lib/enums";

export type AchievementUpdate = {
  slug: string;
  value: number;
  mode: "increment" | "max" | "set";
};

export type UnlockedAchievement = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  coinReward: number;
};

/**
 * Applies XP, resolves any level-ups and pays the (capped, non-wager-scaled)
 * level bonus. Returns the new level so the UI can play the celebration.
 */
export async function awardXp(
  tx: Tx,
  userId: string,
  amount: number,
): Promise<{ level: number; leveledUp: boolean; from: number; coinReward: number }> {
  const xpGain = Math.max(0, Math.trunc(amount));
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { xp: true, level: true },
  });

  const totalXp = user.xp + xpGain;
  const next = levelFromXp(totalXp);
  const leveledUp = next.level > user.level;

  let coinReward = 0;
  if (leveledUp) {
    // Pay a bonus for each level crossed, but never more than 3 at once — this
    // closes the door on any loop that could mint coins from XP.
    const levels = Math.min(3, next.level - user.level);
    for (let i = 0; i < levels; i += 1) {
      coinReward += levelUpCoinReward(user.level + i + 1);
    }
  }

  await tx.user.update({
    where: { id: userId },
    data: { xp: totalXp, level: next.level },
  });

  if (coinReward > 0) {
    await applyLedgerEntry(tx, userId, {
      type: "ADMIN_ADJUSTMENT",
      amount: coinReward,
      source: "level-up",
      metadata: { from: user.level, to: next.level },
    });
    await pushNotification(tx, userId, {
      kind: "REWARD",
      title: `Level ${next.level}`,
      body: `+${coinReward} coins tasonnoususta.`,
      href: "/profile",
    });
    await pushActivity(tx, userId, {
      kind: "LEVEL_UP",
      label: `saavutti Level ${next.level}`,
    });
  }

  return { level: next.level, leveledUp, from: user.level, coinReward };
}

/**
 * Achievement progress is stored per user and evaluated declaratively, so the
 * same code path serves every game without special-casing.
 */
export async function recordAchievementProgress(
  tx: Tx,
  userId: string,
  updates: AchievementUpdate[],
): Promise<UnlockedAchievement[]> {
  if (updates.length === 0) return [];

  const slugs = [...new Set(updates.map((u) => u.slug))];
  const achievements = await tx.achievement.findMany({ where: { slug: { in: slugs } } });
  if (achievements.length === 0) return [];

  const existing = await tx.userAchievement.findMany({
    where: { userId, achievementId: { in: achievements.map((a) => a.id) } },
  });
  const byAchievement = new Map(existing.map((row) => [row.achievementId, row]));

  const unlocked: UnlockedAchievement[] = [];

  for (const achievement of achievements) {
    const relevant = updates.filter((u) => u.slug === achievement.slug);
    if (relevant.length === 0) continue;
    const current = byAchievement.get(achievement.id);
    if (current?.unlockedAt) continue;

    let progress = current?.progress ?? 0;
    for (const update of relevant) {
      const value = Math.trunc(update.value);
      if (update.mode === "increment") progress += value;
      else if (update.mode === "max") progress = Math.max(progress, value);
      else progress = value;
    }
    progress = Math.max(0, Math.min(achievement.target, progress));

    const nowUnlocked = progress >= achievement.target;

    if (current) {
      await tx.userAchievement.update({
        where: { id: current.id },
        data: { progress, unlockedAt: nowUnlocked ? new Date() : null },
      });
    } else {
      await tx.userAchievement.create({
        data: {
          userId,
          achievementId: achievement.id,
          progress,
          unlockedAt: nowUnlocked ? new Date() : null,
        },
      });
    }

    if (nowUnlocked) {
      if (achievement.coinReward > 0) {
        await applyLedgerEntry(tx, userId, {
          type: "ADMIN_ADJUSTMENT",
          amount: achievement.coinReward,
          source: `achievement:${achievement.slug}`,
        });
      }
      await pushNotification(tx, userId, {
        kind: "ACHIEVEMENT",
        title: achievement.title,
        body: achievement.description,
        href: "/profile",
      });
      await pushActivity(tx, userId, {
        kind: "ACHIEVEMENT",
        label: `avasi saavutuksen ${achievement.title}`,
      });
      unlocked.push({
        slug: achievement.slug,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        coinReward: achievement.coinReward,
      });
    }
  }

  return unlocked;
}

export async function pushNotification(
  tx: Tx,
  userId: string,
  input: { kind: string; title: string; body?: string; href?: string },
): Promise<void> {
  await tx.notification.create({
    data: {
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    },
  });
}

/**
 * Public feed. Only carries a label and an amount — never a balance, never a
 * transaction id, and only for users who left activity sharing on.
 */
export async function pushActivity(
  tx: Tx,
  userId: string,
  input: { kind: ActivityKind; label: string; amount?: number; rarity?: Rarity },
): Promise<void> {
  // Legacy publication disabled; historical ActivityEvent rows remain untouched.
  void tx; void userId; void input;
}

export type StatDelta = {
  gamesPlayed?: number;
  totalWagered?: number;
  totalWon?: number;
  casesOpened?: number;
  battlesPlayed?: number;
  battlesWon?: number;
  mobsDefeated?: number;
  biggestWin?: number; // max
  highestCrash?: number; // max
  bestMinesMult?: number; // max
  bestCombo?: number; // max
  won?: boolean; // drives the win-streak counter
};

export async function updateStats(
  tx: Tx,
  userId: string,
  delta: StatDelta,
): Promise<{ winStreak: number; biggestWin: number }> {
  const stats =
    (await tx.userStats.findUnique({ where: { userId } })) ??
    (await tx.userStats.create({ data: { userId } }));

  const winStreak =
    delta.won === undefined ? stats.winStreak : delta.won ? stats.winStreak + 1 : 0;

  const updated = await tx.userStats.update({
    where: { userId },
    data: {
      gamesPlayed: { increment: delta.gamesPlayed ?? 0 },
      totalWagered: { increment: delta.totalWagered ?? 0 },
      totalWon: { increment: delta.totalWon ?? 0 },
      casesOpened: { increment: delta.casesOpened ?? 0 },
      battlesPlayed: { increment: delta.battlesPlayed ?? 0 },
      battlesWon: { increment: delta.battlesWon ?? 0 },
      mobsDefeated: { increment: delta.mobsDefeated ?? 0 },
      biggestWin: Math.max(stats.biggestWin, delta.biggestWin ?? 0),
      highestCrash: Math.max(stats.highestCrash, delta.highestCrash ?? 0),
      bestMinesMult: Math.max(stats.bestMinesMult, delta.bestMinesMult ?? 0),
      bestCombo: Math.max(stats.bestCombo, delta.bestCombo ?? 0),
      winStreak,
      bestWinStreak: Math.max(stats.bestWinStreak, winStreak),
    },
  });

  return { winStreak: updated.winStreak, biggestWin: updated.biggestWin };
}
