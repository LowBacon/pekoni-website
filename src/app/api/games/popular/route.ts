import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

/** Play counts behind the "Most Played" ordering in the game library. */
export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`popular:${user.id}`, LIMITS.read);

    const [rounds, cases, battles] = await Promise.all([
      prisma.gameRound.groupBy({ by: ["game"], _count: { _all: true } }),
      prisma.caseOpening.count(),
      prisma.battleParticipant.count(),
    ]);

    const playCounts: Record<string, number> = { cases, battles };
    for (const row of rounds) playCounts[row.game] = row._count._all;

    return ok({ playCounts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
