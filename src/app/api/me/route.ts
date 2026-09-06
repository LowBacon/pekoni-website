import { getCurrentUser } from "@/server/auth";
import { handleError, ok } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return ok({ user: null });
    return ok({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        minecraftUsername: user.minecraftUsername,
        avatarUrl: user.avatarUrl,
        balance: user.balance,
        level: user.level,
        xp: user.xp,
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
