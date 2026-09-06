import { pluginRoute } from "@/server/pluginRoute";
import { completeTransfer, MinecraftError } from "@/server/minecraft";

export const dynamic = "force-dynamic";

/**
 * Delivery confirmed in game. Safe to call repeatedly: a transfer that is
 * already COMPLETED returns the same receipt without crediting again, which is
 * what lets the plugin retry after a timeout without risk.
 */
export const POST = pluginRoute<{ transferId?: string }>(async (body) => {
  const id = String(body.transferId ?? "");
  if (!id) throw new MinecraftError("transferId puuttuu.", "BAD_REQUEST", 400);
  return completeTransfer(id);
});
