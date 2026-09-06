import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

/** Current preferences and fairness seeds for the settings page. */
export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`me-settings:${user.id}`, LIMITS.read);

    const settings = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        soundEnabled: true,
        reducedMotion: true,
        publicActivity: true,
        minecraftUsername: true,
        clientSeed: true,
        serverSeedHash: true,
        nonce: true,
        passwordHash: true,
      },
    });

    // The hash itself never leaves the server — only whether one exists.
    const { passwordHash, ...rest } = settings;
    return ok(
      { settings: { ...rest, hasPassword: passwordHash !== null } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}
