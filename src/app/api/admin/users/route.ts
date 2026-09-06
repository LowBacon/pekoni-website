import { requireRole } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";
import { searchUsers } from "@/server/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Authorisation happens here, on the server — the admin UI never gates it.
    const actor = await requireRole("MODERATOR");
    requireRate(`admin-users:${actor.id}`, LIMITS.read);

    const query = new URL(request.url).searchParams.get("q") ?? "";
    const users = await searchUsers(query);

    return ok({ users }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
