import { pluginRoute } from "@/server/pluginRoute";
import { failTransfer, MinecraftError } from "@/server/minecraft";

export const dynamic = "force-dynamic";

/**
 * The plugin could not deliver. The coins go back to the wallet as a new ledger
 * credit — the debit is never erased, so both halves stay auditable.
 */
export const POST = pluginRoute<{ transferId?: string; reason?: string; confirmedNotDelivered?: boolean }>(async (body) => {
  const id = String(body.transferId ?? "");
  if (!id) throw new MinecraftError("transferId puuttuu.", "BAD_REQUEST", 400);
  return failTransfer(id, String(body.reason ?? "Palvelin ilmoitti virheestä."), body.confirmedNotDelivered === true);
});
