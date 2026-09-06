import type { Metadata } from "next";
import { IS_STATIC } from "@/lib/static/config";
import MineBetHomeView, { type HomeData } from "@/components/home/MineBetHomeView";

export const metadata: Metadata = {
  title: "MineBet | Pekoni",
  description:
    "Pekonin oma pelialusta. Pelaa, kehity ja nouse huipulle MineBetin peleissä virtuaalisilla Pekoni Coinseilla.",
};

// No `dynamic` export: the server build reads cookies while loading its data,
// which already makes it dynamic, and the static build must stay exportable.

async function loadHome(): Promise<HomeData | null> {
  if (IS_STATIC) return null;

  const [{ requireUser }, { prisma }, { getLeaderboardRank }] = await Promise.all([
    import("@/server/auth"),
    import("@/server/db"),
    import("@/server/queries"),
  ]);

  const user = await requireUser();

  const [stats, rank, biggest] = await Promise.all([
    prisma.userStats.findUnique({ where: { userId: user.id } }),
    getLeaderboardRank(user.id),
    prisma.gameRound.findFirst({
      where: { userId: user.id },
      orderBy: { payout: "desc" },
      select: { payout: true, bet: true, game: true, multiplier: true },
    }),
  ]);

  return {
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
  };
}

export default async function MineBetHome() {
  return <MineBetHomeView initial={await loadHome()} />;
}
