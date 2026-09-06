import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  isProviderConfigured,
  safeNext,
  startAuthorization,
} from "@/server/oauth";
import { isOAuthProvider } from "@/lib/oauth";
import { clientIp, LIMITS, rateLimit } from "@/server/api";

export const dynamic = "force-dynamic";

/**
 * Step one of the flow: send the browser to Google or Discord.
 *
 * A plain link rather than a fetch, because the destination is a cross-origin
 * page the user has to see. Failures therefore have to come back as a redirect
 * to a Pekoni page carrying a code — there is nobody to hand a JSON error to.
 *
 * `mode=link` attaches the provider to the signed-in account instead of signing
 * in with it. Which one it is gets sealed into the hand-off cookie, so the
 * callback cannot be talked into the other by editing a query string.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const url = new URL(request.url);

  const bounce = (target: string, code: string) =>
    NextResponse.redirect(new URL(`${target}?oauth_error=${code}`, url.origin), 303);

  if (!isOAuthProvider(provider) || !isProviderConfigured(provider)) {
    return bounce("/login", "unavailable");
  }

  // Sign-in attempts are cheap for us and cheap for a script; the same bucket
  // that guards password login guards this one.
  if (!rateLimit(`oauth-start:${clientIp(request)}`, LIMITS.auth)) {
    return bounce("/login", "rate");
  }

  const wantsLink = url.searchParams.get("mode") === "link";
  const user = wantsLink ? await getCurrentUser() : null;
  const mode = user ? "link" : "login";

  // Asking to link while signed out is a stale tab, not an attack — send them
  // through the login door instead of failing.
  const fallback = mode === "link" ? "/settings" : "/home";
  const next = safeNext(url.searchParams.get("next"), fallback);

  const { url: authorizeUrl, cookie } = startAuthorization(request, provider, { mode, next, userId: user?.id });

  const response = NextResponse.redirect(authorizeUrl, 303);
  response.cookies.set(OAUTH_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax", // the provider redirects back top-level; "strict" would drop it
    secure: process.env.NODE_ENV === "production",
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  return response;
}
