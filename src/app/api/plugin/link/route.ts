import { pluginRoute } from "@/server/pluginRoute";
import { redeemLinkCode } from "@/server/minecraft";

export const dynamic = "force-dynamic";

/**
 * `/minebet link <code>` in game lands here.
 *
 * This is the moment ownership is proved: the code was shown only to a signed-in
 * browser session, and it is being presented from inside the server by an
 * authenticated player. Neither side alone is enough.
 */
export const POST = pluginRoute<{ code?: string; uuid?: string; username?: string }>(
  async (body) => {
    const result = await redeemLinkCode({
      code: String(body.code ?? ""),
      uuid: String(body.uuid ?? ""),
      username: String(body.username ?? ""),
    });
    return { linked: result };
  },
);
