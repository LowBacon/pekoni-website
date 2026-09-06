import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";
import { TRANSACTION_TYPES } from "@/lib/enums";

export const dynamic = "force-dynamic";

const query = z.object({
  type: z.enum(["ALL", ...TRANSACTION_TYPES]).catch("ALL"),
  direction: z.enum(["ALL", "IN", "OUT"]).catch("ALL"),
  search: z.string().trim().max(64).catch(""),
  days: z.coerce.number().int().min(1).max(365).catch(90),
  cursor: z.string().trim().max(64).catch(""),
  limit: z.coerce.number().int().min(1).max(100).catch(25),
});

/**
 * The searchable ledger.
 *
 * Cursor-paginated rather than offset-paginated: the list is ordered by a
 * timestamp that keeps growing, and offsets shift under the reader every time a
 * new row lands. Scoped to `user.id` throughout — this endpoint has no shape
 * that can be pointed at somebody else's history.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`transactions:${user.id}`, LIMITS.read);

    const url = new URL(request.url);
    const input = query.parse({
      type: url.searchParams.get("type") ?? "ALL",
      direction: url.searchParams.get("direction") ?? "ALL",
      search: url.searchParams.get("search") ?? "",
      days: url.searchParams.get("days") ?? 90,
      cursor: url.searchParams.get("cursor") ?? "",
      limit: url.searchParams.get("limit") ?? 25,
    });

    const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

    const where: Prisma.TransactionWhereInput = {
      userId: user.id,
      createdAt: { gte: since },
      ...(input.type !== "ALL" ? { type: input.type } : {}),
      ...(input.direction === "IN" ? { amount: { gt: 0 } } : {}),
      ...(input.direction === "OUT" ? { amount: { lt: 0 } } : {}),
      ...(input.search
        ? {
            OR: [
              { source: { contains: input.search } },
              { metadata: { contains: input.search } },
              { id: { contains: input.search } },
            ],
          }
        : {}),
    };

    // One extra row tells us whether another page exists without a second query.
    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true, type: true, amount: true, balanceBefore: true, balanceAfter: true,
        source: true, gameId: true, metadata: true, createdAt: true,
      },
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const totals = await prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    return ok(
      {
        transactions: page.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          metadata: safeParse(row.metadata),
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
        totals: totals.map((t) => ({
          type: t.type,
          amount: t._sum.amount ?? 0,
          count: t._count._all,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}

/** Metadata is operator-written JSON; a malformed row must not break the page. */
function safeParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
