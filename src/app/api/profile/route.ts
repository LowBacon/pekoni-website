import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { getUserOverview } from "@/server/queries";
import { getDailyStatus } from "@/server/daily";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

/**
 * Everything the character lodge shows about the signed-in player. Scoped to
 * `user.id` throughout — this endpoint can never be pointed at somebody else.
 */
export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`profile:${user.id}`, LIMITS.read);

    const [overview, transactions, openings, battles, daily, settings] = await Promise.all([
      getUserOverview(user.id),
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.caseOpening.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { item: true, case: { select: { name: true, theme: true } } },
      }),
      prisma.battleParticipant.findMany({
        where: { userId: user.id },
        orderBy: { joinedAt: "desc" },
        take: 8,
        include: { battle: { include: { case: { select: { name: true } } } } },
      }),
      getDailyStatus(user.id),
      prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { serverSeedHash: true, clientSeed: true, nonce: true, createdAt: true },
      }),
    ]);

    const stats = overview.stats;

    return ok(
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          minecraftUsername: user.minecraftUsername,
          balance: user.balance,
          level: overview.progress.level,
          xp: user.xp,
          title: overview.title,
          createdAt: settings.createdAt.toISOString(),
        },
        progress: overview.progress,
        rank: overview.rank,
        daily,
        fairness: {
          serverSeedHash: settings.serverSeedHash,
          clientSeed: settings.clientSeed,
          nonce: settings.nonce,
        },
        stats: {
          gamesPlayed: stats?.gamesPlayed ?? 0,
          totalWagered: stats?.totalWagered ?? 0,
          totalWon: stats?.totalWon ?? 0,
          netProfit: (stats?.totalWon ?? 0) - (stats?.totalWagered ?? 0),
          biggestWin: stats?.biggestWin ?? 0,
          winStreak: stats?.winStreak ?? 0,
          bestWinStreak: stats?.bestWinStreak ?? 0,
          highestCrash: stats?.highestCrash ?? 0,
          bestMinesMult: stats?.bestMinesMult ?? 0,
          casesOpened: stats?.casesOpened ?? 0,
          battlesPlayed: stats?.battlesPlayed ?? 0,
          battlesWon: stats?.battlesWon ?? 0,
          mobsDefeated: stats?.mobsDefeated ?? 0,
          bestCombo: stats?.bestCombo ?? 0,
        },
        achievements: overview.achievements.map((entry) => ({
          slug: entry.achievement.slug,
          title: entry.achievement.title,
          description: entry.achievement.description,
          icon: entry.achievement.icon,
          category: entry.achievement.category,
          target: entry.achievement.target,
          progress: entry.progress,
          xpReward: entry.achievement.xpReward,
          coinReward: entry.achievement.coinReward,
          unlockedAt: entry.unlockedAt?.toISOString() ?? null,
        })),
        rounds: overview.recentRounds.map((round) => ({
          id: round.id,
          game: round.game,
          bet: round.bet,
          payout: round.payout,
          multiplier: round.multiplier,
          outcome: round.outcome,
          createdAt: round.createdAt.toISOString(),
        })),
        transactions: transactions.map((entry) => ({
          id: entry.id,
          type: entry.type,
          amount: entry.amount,
          balanceAfter: entry.balanceAfter,
          source: entry.source,
          createdAt: entry.createdAt.toISOString(),
        })),
        openings: openings.map((entry) => ({
          id: entry.id,
          caseName: entry.case.name,
          theme: entry.case.theme,
          cost: entry.cost,
          value: entry.value,
          source: entry.source,
          item: {
            name: entry.item.name,
            rarity: entry.item.rarity,
            icon: entry.item.icon,
            value: entry.value,
          },
          createdAt: entry.createdAt.toISOString(),
        })),
        battles: battles.map((entry) => ({
          id: entry.battleId,
          caseName: entry.battle.case.name,
          mode: entry.battle.mode,
          status: entry.battle.status,
          entryCost: entry.battle.entryCost,
          total: entry.total,
          payout: entry.payout,
          isWinner: entry.isWinner,
          joinedAt: entry.joinedAt.toISOString(),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
