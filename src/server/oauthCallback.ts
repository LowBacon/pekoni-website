import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { createSession, getCurrentUser } from "./auth";
import { linkProvider, signInWithProfile } from "./identities";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAuthError, fetchProfile, openHandoff } from "./oauth";
import { isOAuthProvider } from "@/lib/oauth";

/**
 * Step two of the flow: the provider sends the browser back with a code.
 *
 * Extracted from the route so the same handler can serve two paths. Providers
 * check the `redirect_uri` against an allowlist configured in their console, and
 * the two ecosystems disagree about what that path should look like — the
 * NextAuth convention is `/api/auth/callback/<provider>`, which is what most
 * setup guides tell you to paste, while this app originally used
 * `/api/auth/oauth/<provider>/callback`. Serving both means a console configured
 * either way works, and nobody loses an afternoon to
 * "Invalid OAuth2 redirect_uri".
 *
 * Everything that can go wrong ends the same way — a redirect to a Pekoni page
 * with a short `oauth_error` code that the page turns into a sentence. Codes
 * rather than messages keeps provider text, and anything an attacker could stuff
 * into a query string, out of the UI.
 */
export async function handleOAuthCallback(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await context.params;
  const url = new URL(request.url);

  const handoff = openHandoff(request.cookies.get(OAUTH_COOKIE)?.value);

  // Where to send them on failure: back to the page they started from when the
  // hand-off survived, otherwise the login page.
  const failurePage = handoff?.mode === "link" ? handoff.next : "/login";

  const finish = (path: string, params: Record<string, string>) => {
    const target = new URL(path, url.origin);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    const response = NextResponse.redirect(target, 303);
    // The hand-off is single-use whatever the outcome.
    response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  if (!isOAuthProvider(provider)) return finish("/login", { oauth_error: "unavailable" });

  // The provider reports a refused consent screen here, not by failing.
  if (url.searchParams.get("error")) {
    return finish(failurePage, { oauth_error: "denied" });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  /*
    A flow that started at one provider must come back at that provider's path.

    Worth its own error code rather than being folded into "state": when a
    console has the wrong redirect URI registered — a Discord app pointing at
    `/api/auth/callback/google`, say — the provider itself is perfectly happy,
    and the only symptom is a sign-in that dies here. Reporting it as an expired
    session sends whoever is debugging it looking at cookies and clocks instead
    of at the one line of configuration that is actually wrong.
  */
  if (handoff && handoff.provider !== provider) {
    console.error(
      `[pekoni] oauth callback provider mismatch: flow started for ` +
        `"${handoff.provider}" but returned at "/api/auth/callback/${provider}". ` +
        `Check the redirect URI registered in the ${handoff.provider} console.`,
    );
    return finish(failurePage, { oauth_error: "mismatch" });
  }

  if (!handoff || !code || !state) {
    return finish(failurePage, { oauth_error: "state" });
  }

  // Constant-time, and length-guarded because timingSafeEqual throws otherwise.
  if (
    handoff.state.length !== state.length ||
    !crypto.timingSafeEqual(Buffer.from(handoff.state), Buffer.from(state))
  ) {
    return finish(failurePage, { oauth_error: "state" });
  }

  try {
    const profile = await fetchProfile(request, provider, code, handoff.verifier);

    if (handoff.mode === "link") {
      // Re-read the session now: the tab could have signed out while the user
      // was away at the provider, and linking to a stale id would be wrong.
      const user = await getCurrentUser();
      if (!user || user.id !== handoff.userId || user.status !== "ACTIVE") {
        return finish("/login", { oauth_error: "session" });
      }

      await linkProvider(user.id, provider, profile);
      return finish(handoff.next, { linked: provider });
    }

    const outcome = await signInWithProfile(provider, profile);
    await createSession(outcome.userId, request.headers.get("user-agent") ?? undefined);

    return finish(handoff.next, {
      [outcome.created ? "welcome" : "signed_in"]: provider,
    });
  } catch (error) {
    if (error instanceof OAuthError) {
      const reason =
        error.status === 409 ? "taken" : error.status === 403 ? "suspended" : "failed";
      return finish(failurePage, { oauth_error: reason });
    }
    console.error("[pekoni] oauth callback failed:", error);
    return finish(failurePage, { oauth_error: "failed" });
  }
}
