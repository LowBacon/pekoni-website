import { handleOAuthCallback } from "@/server/oauthCallback";

export const dynamic = "force-dynamic";

/**
 * Compatibility alias for the original callback path.
 *
 * `redirectUri()` no longer sends this one, but a provider console configured
 * against it earlier still works — which matters because a wrong redirect URI
 * fails at the provider with a message that says nothing about which side is
 * misconfigured.
 */
export const GET = handleOAuthCallback;
