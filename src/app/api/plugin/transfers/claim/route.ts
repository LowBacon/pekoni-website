import { pluginRoute } from "@/server/pluginRoute";
import { claimTransfers } from "@/server/minecraft";

export const dynamic = "force-dynamic";

/**
 * The plugin's poll. Returns transfers to deliver and marks them CLAIMED in the
 * same call, so a second poller cannot pick up the same work.
 */
export const POST = pluginRoute<{ limit?: number }>(async (body) => {
  const transfers = await claimTransfers(Number(body.limit) || 25);
  return { transfers };
});
