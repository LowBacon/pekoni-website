import { handleOAuthCallback } from "@/server/oauthCallback";

export const dynamic = "force-dynamic";

/**
 * The canonical OAuth callback: `/api/auth/callback/<provider>`.
 *
 * This is the path the provider consoles are configured with, and the one
 * `redirectUri()` sends. The logic lives in `src/server/oauthCallback.ts` so the
 * older path can serve the identical handler.
 */
export const GET = handleOAuthCallback;
