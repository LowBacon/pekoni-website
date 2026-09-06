import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { claimDaily, getDailyStatus } from "@/server/daily";

export const dynamic = "force-dynamic";

const schema = z.object({ idempotencyKey: z.string().min(8).max(64).optional() });

export async function GET() {
  try {
    const user = await requireUser();
    const status = await getDailyStatus(user.id);
    return ok(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`daily:${user.id}`, LIMITS.write);
    const input = await parseBody(request, schema);
    const result = await claimDaily({ userId: user.id, idempotencyKey: input.idempotencyKey });
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
