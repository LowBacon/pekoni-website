import type { Metadata } from "next";
import { IS_STATIC } from "@/lib/static/config";
import LandingView, { type LandingData } from "@/components/landing/LandingView";

export const metadata: Metadata = {
  title: "MineBet | Pekoni Gaming Network",
  description:
    "Server-settled rounds, verifiable randomness and a public live results feed. " +
    "Pekoni Coins are closed-loop virtual currency: transferable to your Minecraft " +
    "character, never redeemable for cash.",
};

// No `dynamic` export: the server build reads cookies while loading its data,
// which already makes it dynamic, and the static build must stay exportable.

/**
 * Server build: the page arrives with the session already resolved. Static
 * build: it ships signed-out and the same view fills itself in from the local
 * backend on first paint.
 */
async function loadLanding(): Promise<LandingData | null> {
  if (IS_STATIC) return null;

  const [{ getCurrentUser }, { prisma }, { getDailyStatus }, { getLeaderboardRank }] =
    await Promise.all([
      import("@/server/auth"),
      import("@/server/db"),
      import("@/server/daily"),
      import("@/server/queries"),
    ]);

  const user = await getCurrentUser();

  const [totals, daily, rank, achievement] = await Promise.all([
    prisma.user.count(),
    user ? getDailyStatus(user.id) : null,
    user ? getLeaderboardRank(user.id) : null,
    user
      ? prisma.userAchievement.findFirst({
          where: { userId: user.id, unlockedAt: { not: null } },
          orderBy: { unlockedAt: "desc" },
          include: { achievement: true },
        })
      : null,
  ]);

  return {
    totals,
    rank,
    daily: daily
      ? { available: daily.available, nextAvailableAt: daily.nextAvailableAt }
      : null,
    user: user
      ? {
          id: user.id,
          username: user.username,
          minecraftUsername: user.minecraftUsername,
          balance: user.balance,
          xp: user.xp,
          level: user.level,
        }
      : null,
    latestAchievement: achievement
      ? {
          title: achievement.achievement.title,
          unlockedAt: achievement.unlockedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export default async function LandingPage() {
  return <LandingView initial={await loadLanding()} />;
}
