import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { createBattle, listBattles, recentBattles, validateBattleInput } from "@/server/battles";

export const dynamic = "force-dynamic";

const schema = z.object({
  caseId: z.string().min(1),
  rounds: z.number(),
  slots: z.number(),
  mode: z.string(),
  bots: z.number().optional(),
});

export async function GET() {
  try {
    await requireUser();
    const [open, recent] = await Promise.all([listBattles(), recentBattles()]);
    return ok({ battles: open, recent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`battle-create:${user.id}`, LIMITS.write);

    const input = await parseBody(request, schema);
    const validated = validateBattleInput(input);

    const battleId = await createBattle({
      userId: user.id,
      caseId: input.caseId,
      ...validated,
    });

    return ok({ battleId }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
