import { pluginRoute } from "@/server/pluginRoute";
import { heartbeat, reapStaleTransfers } from "@/server/minecraft";

export const dynamic = "force-dynamic";

/**
 * Periodic ping carrying who is online. Also the natural place to refund
 * transfers nobody delivered: the plugin is alive, so anything still sitting in
 * PENDING past its deadline is genuinely stuck rather than merely waiting.
 */
export const POST = pluginRoute<{ online?: string[] }>(async (body) => {
  const seen = await heartbeat(Array.isArray(body.online) ? body.online : []);
  const refunded = await reapStaleTransfers();
  return { seen, refunded, serverTime: new Date().toISOString() };
});
