import { requireUser } from "@/server/auth";
import { getLinkStatus, issueLinkCode, MinecraftError } from "@/server/minecraft";
import { isPluginConfigured } from "@/server/pluginAuth";
import { fail, handleError, LIMITS, ok, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

/** Current link state, plus whether the server integration is even reachable. */
export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`mc-link-read:${user.id}`, LIMITS.read);
    return ok(
      { status: await getLinkStatus(user.id), integrationReady: isPluginConfigured() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}

/** Issues a one-time code for the player to type in game. */
export async function POST() {
  try {
    const user = await requireUser();
    requireRate(`mc-link-code:${user.id}`, LIMITS.write);

    if (!isPluginConfigured()) {
      return fail(
        "Palvelinyhteyttä ei ole vielä määritetty. Ota yhteyttä ylläpitoon.",
        503,
        "INTEGRATION_OFF",
      );
    }

    return ok(await issueLinkCode(user.id), { status: 201 });
  } catch (error) {
    if (error instanceof MinecraftError) return fail(error.message, error.status, error.code);
    return handleError(error);
  }
}
