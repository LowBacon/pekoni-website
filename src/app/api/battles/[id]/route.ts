import { requireUser } from "@/server/auth";
import { fail, handleError, LIMITS, ok, requireRate } from "@/server/api";
import { getBattleView, settleFinishedBattles } from "@/server/battles";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    requireRate(`battle-view:${user.id}`, LIMITS.read);

    const { id } = await params;

    // Battles settle the moment anyone looks at a finished one, so no scheduled
    // worker is needed for payouts to land.
    await settleFinishedBattles().catch(() => undefined);

    const battle = await getBattleView(id);
    if (!battle) return fail("Battlea ei löytynyt.", 404);

    return ok(battle, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
