import { requireUser } from "@/server/auth";
import { MinecraftError, unlinkMinecraft } from "@/server/minecraft";
import { fail, handleError, LIMITS, ok, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    requireRate(`mc-unlink:${user.id}`, LIMITS.write);
    await unlinkMinecraft(user.id);
    return ok({ ok: true });
  } catch (error) {
    if (error instanceof MinecraftError) return fail(error.message, error.status, error.code);
    return handleError(error);
  }
}
