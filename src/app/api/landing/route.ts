import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { getDailyStatus } from "@/server/daily";
import { getLeaderboardRank } from "@/server/queries";
import { handleError, ok } from "@/server/api";

export const dynamic = "force-dynamic";

/**
 * The cinematic front door. Works signed out — everything player-specific is
 * null until there is a session.
 */
export async function GET() {
  try {
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

    return ok(
      {
        totals,
        rank,
        daily,
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
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
