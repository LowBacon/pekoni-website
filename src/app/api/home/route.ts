import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { getLeaderboardRank } from "@/server/queries";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

/** Data behind the MineBet landing page. Same payload in both build modes. */
export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`home:${user.id}`, LIMITS.read);

    const [stats, rank, biggest] = await Promise.all([
      prisma.userStats.findUnique({ where: { userId: user.id } }),
      getLeaderboardRank(user.id),
      prisma.gameRound.findFirst({
        where: { userId: user.id },
        orderBy: { payout: "desc" },
        select: { payout: true, bet: true, game: true, multiplier: true },
      }),
    ]);

    return ok(
      {
        user: {
          id: user.id,
          username: user.username,
          minecraftUsername: user.minecraftUsername,
          balance: user.balance,
          xp: user.xp,
          level: user.level,
        },
        rank,
        biggest,
        stats: {
          gamesPlayed: stats?.gamesPlayed ?? 0,
          totalWagered: stats?.totalWagered ?? 0,
          totalWon: stats?.totalWon ?? 0,
          biggestWin: stats?.biggestWin ?? 0,
          winStreak: stats?.winStreak ?? 0,
          bestWinStreak: stats?.bestWinStreak ?? 0,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
