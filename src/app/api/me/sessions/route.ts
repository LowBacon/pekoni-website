import { z } from "zod";
import { requireUser } from "@/server/auth";
import { listSessions, revokeAllSessions, revokeSession } from "@/server/account";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`sessions:${user.id}`, LIMITS.read);
    return ok({ sessions: await listSessions(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

const schema = z.union([
  z.object({ sessionId: z.string().min(1) }),
  // Defaults to keeping this session: "sign out everywhere else" is the common
  // intent, and logging the player out of the page they are on is a surprise.
  z.object({ all: z.literal(true), keepCurrent: z.boolean().optional() }),
]);

/** Revokes one session, or every session (optionally keeping this one). */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`sessions-write:${user.id}`, LIMITS.write);
    const input = await parseBody(request, schema);

    if ("all" in input) {
      const keepCurrent = input.keepCurrent ?? true;
      const revoked = await revokeAllSessions(user.id, { keepCurrent });
      return ok({ revoked, sessions: keepCurrent ? await listSessions(user.id) : [] });
    }

    await revokeSession(user.id, input.sessionId);
    return ok({ revoked: 1, sessions: await listSessions(user.id) });
  } catch (error) {
    return handleError(error);
  }
}
