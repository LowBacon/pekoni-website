import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { expectedValue, rarityOdds } from "@/server/cases";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";
import { DAILY_CASE_SLUG } from "@/server/daily";

export const dynamic = "force-dynamic";

/**
 * The case catalogue, including the exact drop chance of every item.
 *
 * Weights are public on purpose — a player can check that the odds shown on the
 * card are the odds the server draws from. The draw itself still happens
 * server-side from the provably-fair stream.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`cases:${user.id}`, LIMITS.read);

    const includeDaily = new URL(request.url).searchParams.get("daily") === "1";

    const cases = await prisma.case.findMany({
      where: {
        active: true,
        ...(includeDaily ? {} : { kind: { not: "DAILY" } }),
      },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      include: { items: { orderBy: { value: "asc" } } },
    });

    const opened = await prisma.caseOpening.groupBy({
      by: ["caseId"],
      _count: { _all: true },
    });
    const openCounts = new Map(opened.map((row) => [row.caseId, row._count._all]));

    return ok(
      {
        cases: cases.map((entry) => {
          const totalWeight = entry.items.reduce((sum, item) => sum + item.weight, 0) || 1;
          return {
            id: entry.id,
            slug: entry.slug,
            name: entry.name,
            tagline: entry.tagline,
            description: entry.description,
            price: entry.price,
            theme: entry.theme,
            kind: entry.kind,
            isDaily: entry.slug === DAILY_CASE_SLUG,
            opened: openCounts.get(entry.id) ?? 0,
            expectedValue: Math.round(expectedValue(entry.items)),
            odds: rarityOdds(entry.items),
            items: entry.items
              .map((item) => ({
                id: item.id,
                name: item.name,
                rarity: item.rarity,
                icon: item.icon,
                value: item.value,
                chance: item.weight / totalWeight,
              }))
              .sort((a, b) => b.value - a.value),
          };
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
