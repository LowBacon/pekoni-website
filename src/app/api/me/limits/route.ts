import { z } from "zod";
import { requireUser } from "@/server/auth";
import { getLimits, updateLimits } from "@/server/limits";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`limits:${user.id}`, LIMITS.read);
    return ok({ limits: await getLimits(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

const schema = z.object({
  dailyWagerCap: z.number().int().positive().nullable().optional(),
  maxBet: z.number().int().positive().nullable().optional(),
  breakHours: z.number().int().positive().max(2160).nullable().optional(),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`limits-write:${user.id}`, LIMITS.write);
    const input = await parseBody(request, schema);
    return ok({ limits: await updateLimits(user.id, input) });
  } catch (error) {
    return handleError(error);
  }
}
