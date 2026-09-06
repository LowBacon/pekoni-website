import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";
import { joinBattle } from "@/server/battles";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    requireRate(`battle-join:${user.id}`, LIMITS.write);

    const { id } = await params;
    await joinBattle(user.id, id);

    return ok({ battleId: id });
  } catch (error) {
    return handleError(error);
  }
}
