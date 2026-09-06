import { z } from "zod";
import { requireUser } from "@/server/auth";
import { linkedAccounts, unlinkProvider } from "@/server/identities";
import { availableProviders, OAuthError } from "@/server/oauth";
import { OAUTH_PROVIDERS } from "@/lib/oauth";
import { fail, handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

/** What the settings page needs to draw the connections list. */
export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`connections:${user.id}`, LIMITS.read);

    return ok(
      {
        linked: await linkedAccounts(user.id),
        available: availableProviders(),
        hasPassword: user.hasPassword,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleError(error);
  }
}

const schema = z.object({ provider: z.enum(OAUTH_PROVIDERS) });

/** Removes a link. Refuses to remove the last way into the account. */
export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`connections-write:${user.id}`, LIMITS.write);
    const { provider } = await parseBody(request, schema);

    await unlinkProvider(user.id, provider);

    return ok({ linked: await linkedAccounts(user.id) });
  } catch (error) {
    if (error instanceof OAuthError) return fail(error.message, error.status);
    return handleError(error);
  }
}
