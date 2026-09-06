import { z } from "zod";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import {
  createTransfer,
  getLinkStatus,
  getTransferLimits,
  MinecraftError,
  TRANSFER_MAX,
  TRANSFER_MIN,
} from "@/server/minecraft";
import { isPluginConfigured } from "@/server/pluginAuth";
import { fail, handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

/** Transfer history plus everything the transfer form needs to render honestly. */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`transfers-read:${user.id}`, LIMITS.read);

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const take = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));

    const [transfers, limits, link] = await Promise.all([
      prisma.transfer.findMany({
        where: {
          userId: user.id,
          ...(status && status !== "ALL" ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true, reference: true, amount: true, status: true, direction: true,
          minecraftName: true, minecraftUuid: true, failureReason: true,
          createdAt: true, completedAt: true, failedAt: true,
        },
      }),
      getTransferLimits(user.id),
      getLinkStatus(user.id),
    ]);

    return ok(
      {
        transfers: transfers.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          completedAt: t.completedAt?.toISOString() ?? null,
          failedAt: t.failedAt?.toISOString() ?? null,
        })),
        limits,
        link,
        balance: user.balance,
        integrationReady: isPluginConfigured(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}

const schema = z.object({
  amount: z.number().int().min(TRANSFER_MIN).max(TRANSFER_MAX),
  idempotencyKey: z.string().trim().min(16).max(64),
});

/**
 * Creates a transfer. The debit is immediate; delivery is the plugin's job.
 *
 * Refuses outright when the integration is not configured rather than accepting
 * coins into a queue nothing will ever drain.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`transfer-create:${user.id}`, LIMITS.write);

    if (!isPluginConfigured()) {
      return fail(
        "Siirrot ovat pois käytöstä: palvelinyhteyttä ei ole määritetty.",
        503,
        "INTEGRATION_OFF",
      );
    }

    const input = await parseBody(request, schema);
    const receipt = await createTransfer({
      userId: user.id,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
    });

    return ok({ receipt }, { status: 201 });
  } catch (error) {
    if (error instanceof MinecraftError) return fail(error.message, error.status, error.code);
    return handleError(error);
  }
}
