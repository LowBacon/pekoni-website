import { z } from "zod";
import { requireUser } from "@/server/auth";
import { deleteAccount } from "@/server/account";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

const schema = z.object({ confirmation: z.string().min(1).max(64) });

/**
 * Permanent deletion. Requires the account's own username typed back, so a
 * mis-click or a borrowed session cannot do it.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`delete-account:${user.id}`, LIMITS.auth);
    const input = await parseBody(request, schema);
    await deleteAccount(user.id, input.confirmation);
    return ok({ deleted: true });
  } catch (error) {
    return handleError(error);
  }
}
