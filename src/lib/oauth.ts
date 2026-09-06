/**
 * Provider identities, shared by the browser and the server.
 *
 * Nothing secret lives here — only what a button needs to render. Whether a
 * provider is actually usable is decided on the server (it depends on the
 * client id/secret being present) and handed to the client as a plain list.
 */

export const OAUTH_PROVIDERS = ["google", "discord"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** The value stored in `OAuthAccount.provider`. */
export function providerKey(provider: OAuthProvider): string {
  return provider.toUpperCase();
}

type ProviderPresentation = {
  /** Shown on buttons and in the connections list. */
  label: string;
  /** Brand tint used for the icon and the button's hover ring. */
  accent: string;
};

export const OAUTH_PRESENTATION: Record<OAuthProvider, ProviderPresentation> = {
  google: { label: "Google", accent: "#E9EDF2" },
  discord: { label: "Discord", accent: "#8B9BF4" },
};

/** Providers the deployment has credentials for, as sent to the browser. */
export type AvailableProviders = OAuthProvider[];
