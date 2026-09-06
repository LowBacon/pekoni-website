import "server-only";
import crypto from "node:crypto";
import * as oauth from "oauth4webapi";
import {
  OAUTH_PROVIDERS,
  isOAuthProvider,
  type AvailableProviders,
  type OAuthProvider,
} from "@/lib/oauth";

/** OAuth code exchange uses oauth4webapi. Google uses PKCE; Discord uses its confidential-client flow. Existing account/session storage is retained. */

/* -------------------------------------------------------------------------- */
/* Provider definitions                                                       */
/* -------------------------------------------------------------------------- */

export type OAuthProfile = {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  /** Raw material for deriving a Pekoni username on first sign-in. */
  usernameSeed: string;
};

type ProviderDefinition = {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  /** Provider-specific query parameters on the authorize request. */
  authorizeParams?: Record<string, string>;
  clientIdEnv: string;
  clientSecretEnv: string;
  toProfile: (raw: Record<string, unknown>) => OAuthProfile;
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const DEFINITIONS: Record<OAuthProvider, ProviderDefinition> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    /*
      `openid` is not optional here.

      The profile is read from Google's OpenID Connect userinfo endpoint, which
      rejects a token that was not granted `openid`, and the mapper below keys
      identity on `sub` — an OIDC claim that is simply absent without it. Drop
      the scope and sign-in fails at the profile step, *after* the player has
      already consented, which is the worst place to fail.
    */
    scope: "openid email profile",
    authorizeParams: {
      // No refresh token is wanted: Pekoni reads the profile once and is done.
      access_type: "online",
      prompt: "select_account",
    },
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    toProfile: (raw) => {
      const sub = str(raw.sub);
      if (!sub) throw new OAuthError("Google ei palauttanut tunnistetta.");
      const email = str(raw.email);
      return {
        providerAccountId: sub,
        email,
        emailVerified: raw.email_verified === true,
        displayName: str(raw.name) ?? str(raw.given_name),
        avatarUrl: str(raw.picture),
        usernameSeed: str(raw.given_name) ?? str(raw.name) ?? email?.split("@")[0] ?? "kulkija",
      };
    },
  },

  discord: {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    userInfoUrl: "https://discord.com/api/users/@me",
    scope: "identify email",
    authorizeParams: { prompt: "consent" },
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
    toProfile: (raw) => {
      const id = str(raw.id);
      if (!id) throw new OAuthError("Discord ei palauttanut tunnistetta.");
      const username = str(raw.username);
      const avatar = str(raw.avatar);
      return {
        providerAccountId: id,
        email: str(raw.email),
        // Discord's `verified` means the address on the account is confirmed.
        emailVerified: raw.verified === true,
        displayName: str(raw.global_name) ?? username,
        avatarUrl: avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`
          : null,
        usernameSeed: username ?? str(raw.global_name) ?? "kulkija",
      };
    },
  },
};

export class OAuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OAuthError";
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

function credentials(provider: OAuthProvider): { id: string; secret: string } | null {
  const definition = DEFINITIONS[provider];
  const id = process.env[definition.clientIdEnv]?.trim();
  const secret = process.env[definition.clientSecretEnv]?.trim();
  if (!id || !secret) return null;
  return { id, secret };
}

/** A provider is offered only when the deployment actually has its keys. */
export function isProviderConfigured(provider: OAuthProvider): boolean {
  return credentials(provider) !== null;
}

/** The providers to render sign-in buttons for. Empty is a valid answer. */
export function availableProviders(): AvailableProviders {
  return OAUTH_PROVIDERS.filter(isProviderConfigured);
}

/**
 * The exact redirect URI registered with the provider.
 *
 * `PEKONI_PUBLIC_URL` wins when set — behind a proxy it is the only reliable
 * source. Otherwise the forwarded headers are used, then the request URL.
 */
export function redirectUri(request: Request, provider: OAuthProvider): string {
  const configured = process.env.PEKONI_PUBLIC_URL?.trim().replace(/\/+$/, "");
  const base = configured || originFromRequest(request);
  // The NextAuth-style path, because that is what setup guides tell people to
  // paste into the Google and Discord consoles and therefore what is actually
  // registered. The older `/api/auth/oauth/<provider>/callback` still resolves
  // (see the alias route) so an existing console entry keeps working, but this
  // is the one sent to the provider.
  return `${base}/api/auth/callback/${provider}`;
}

function originFromRequest(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return new URL(request.url).origin;
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/* -------------------------------------------------------------------------- */
/* The signed hand-off cookie                                                 */
/* -------------------------------------------------------------------------- */

export const OAUTH_COOKIE = "pekoni_oauth";

/**
 * Scope for the hand-off cookie.
 *
 * Must cover the start route *and* every callback path. It used to be
 * `/api/auth/oauth`, which stopped covering the callback the moment the
 * canonical redirect moved to `/api/auth/callback/<provider>` — the browser
 * would simply not send the cookie back, and every sign-in would fail the state
 * check with no clue why.
 */
export const OAUTH_COOKIE_PATH = "/api/auth";
const HANDOFF_TTL_MS = 10 * 60 * 1000;

export type OAuthMode = "login" | "link";

export type Handoff = {
  provider: OAuthProvider;
  state: string;
  verifier: string;
  mode: OAuthMode;
  /** Where to land afterwards. Always an app-relative path. */
  next: string;
  expiresAt: number;
  userId?: string;
};

function secret(): string {
  const value = process.env.PEKONI_SECRET;
  if (!value || value.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new OAuthError("PEKONI_SECRET puuttuu.", 500);
    }
    return "pekoni-development-secret-fallback-value-0000";
  }
  return value;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function sealHandoff(handoff: Handoff): string {
  const payload = Buffer.from(JSON.stringify(handoff)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function openHandoff(sealed: string | undefined): Handoff | null {
  if (!sealed) return null;
  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  // Length is checked first: timingSafeEqual throws on differing lengths.
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }

  try {
    const handoff = JSON.parse(Buffer.from(payload, "base64url").toString()) as Handoff;
    if (!isOAuthProvider(handoff.provider)) return null;
    if (typeof handoff.expiresAt !== "number" || handoff.expiresAt < Date.now()) return null;
    return handoff;
  } catch {
    return null;
  }
}

/** Open redirects are the classic hole here: only same-site paths are allowed. */
export function safeNext(value: string | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

/* -------------------------------------------------------------------------- */
/* Flow                                                                       */
/* -------------------------------------------------------------------------- */

export type AuthorizeStart = { url: string; cookie: string };

export function startAuthorization(
  request: Request,
  provider: OAuthProvider,
  options: { mode: OAuthMode; next: string; userId?: string },
): AuthorizeStart {
  const creds = credentials(provider);
  if (!creds) throw new OAuthError("Kirjautumistapa ei ole käytössä.", 404);

  const definition = DEFINITIONS[provider];
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  const url = new URL(definition.authorizeUrl);
  url.searchParams.set("client_id", creds.id);
  url.searchParams.set("redirect_uri", redirectUri(request, provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", definition.scope);
  url.searchParams.set("state", state);
  /*
    PKCE on both providers.

    Discord supports S256 and was previously skipping it, which left its flow
    resting on the signed state cookie alone. The two halves must move together —
    a challenge here without a verifier at the token step, or the reverse, is
    rejected by the provider — so this and the `verifier` argument in
    `fetchProfile` are a matched pair.
  */
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  for (const [key, value] of Object.entries(definition.authorizeParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return {
    url: url.toString(),
    cookie: sealHandoff({
      provider,
      state,
      verifier,
      mode: options.mode,
      userId: options.userId,
      next: options.next,
      expiresAt: Date.now() + HANDOFF_TTL_MS,
    }),
  };
}

/** Swaps the authorization code for an access token, then reads the profile. */
export async function fetchProfile(
  request: Request,
  provider: OAuthProvider,
  code: string,
  verifier: string,
): Promise<OAuthProfile> {
  const creds = credentials(provider);
  if (!creds) throw new OAuthError("Kirjautumistapa ei ole käytössä.", 404);
  const definition = DEFINITIONS[provider];

  const as: oauth.AuthorizationServer = { issuer: provider === "google" ? "https://accounts.google.com" : "https://discord.com", token_endpoint: definition.tokenUrl };
  const client: oauth.Client = { client_id: creds.id };
  // State has already been verified against the signed handoff in the callback.
  const parameters = oauth.validateAuthResponse(as, client, new URLSearchParams({ code }), oauth.expectNoState);
  let accessToken: string;
  try {
    const response = await oauth.authorizationCodeGrantRequest(as, client, oauth.ClientSecretPost(creds.secret), parameters, redirectUri(request, provider), verifier, { signal: AbortSignal.timeout(10000) });
    const token = await oauth.processAuthorizationCodeResponse(as, client, response);
    accessToken = token.access_token;
  } catch { throw new OAuthError("Tunnistautuminen epäonnistui. Yritä uudelleen.", 502); }

  const profileResponse = await withTimeout((signal) =>
    fetch(definition.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      cache: "no-store",
      signal,
    }),
  );

  if (!profileResponse.ok) {
    console.error(`[pekoni] ${provider} profile fetch failed:`, profileResponse.status);
    throw new OAuthError("Profiilin lukeminen epäonnistui.", 502);
  }

  return definition.toProfile((await profileResponse.json()) as Record<string, unknown>);
}

/** A hung provider must not hold a request handler open indefinitely. */
async function withTimeout(run: (signal: AbortSignal) => Promise<Response>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OAuthError("Palveluun ei saatu yhteyttä. Yritä uudelleen.", 504);
    }
    throw new OAuthError("Palveluun ei saatu yhteyttä. Yritä uudelleen.", 502);
  } finally {
    clearTimeout(timer);
  }
}
