import { requireRole } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";
import { adminOverview, auditLog, economySeries, popularGames } from "@/server/admin";
import { getEconomySnapshot } from "@/server/queries";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

const ALLOWED_DAYS = [7, 30, 3650];

/** Admin dashboard payload. Authorisation happens here, never in the UI. */
export async function GET(request: Request) {
  try {
    const actor = await requireRole("MODERATOR");
    requireRate(`admin-overview:${actor.id}`, LIMITS.read);

    const requested = Number(new URL(request.url).searchParams.get("days") ?? 7);
    const days = ALLOWED_DAYS.includes(requested) ? requested : 7;
    const seriesDays = Math.min(days, 30);

    const [overview, snapshot, games, series, logs, cases, battles] = await Promise.all([
      adminOverview(),
      getEconomySnapshot(days),
      popularGames(days),
      economySeries(seriesDays),
      auditLog(40),
      prisma.caseOpening.groupBy({
        by: ["caseId"],
        _count: { _all: true },
        _sum: { cost: true, value: true },
      }),
      prisma.caseBattle.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const caseNames = await prisma.case.findMany({ select: { id: true, name: true, price: true } });
    const nameById = new Map(caseNames.map((entry) => [entry.id, entry]));

    return ok(
      {
        days,
        overview,
        snapshot,
        games,
        series,
        logs,
        role: actor.role,
        cases: cases
          .map((row) => ({
            id: row.caseId,
            name: nameById.get(row.caseId)?.name ?? "—",
            price: nameById.get(row.caseId)?.price ?? 0,
            opened: row._count._all,
            spent: Math.abs(row._sum.cost ?? 0),
            returned: row._sum.value ?? 0,
          }))
          .sort((a, b) => b.opened - a.opened),
        battles: battles.map((row) => ({ status: row.status, count: row._count._all })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
