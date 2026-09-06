import "server-only";
import { NextResponse } from "next/server";
import { PluginAuthError, parsePluginBody, verifyPluginRequest } from "./pluginAuth";
import { MinecraftError } from "./minecraft";

/**
 * Shared wrapper for every plugin endpoint.
 *
 * One place decides what a caller on the far side of the trust boundary is
 * allowed to learn from a failure: a code and a short message, never a stack or
 * an internal detail. Domain errors carry their own code because the plugin has
 * to branch on them (an expired link code is a message to the player; a 500 is
 * a retry).
 */
export function pluginRoute<T>(
  handler: (body: T, request: Request) => Promise<unknown>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    try {
      const raw = await verifyPluginRequest(request);
      const body = parsePluginBody<T>(raw);
      const result = await handler(body, request);
      return NextResponse.json({ ok: true, ...(result as object) });
    } catch (error) {
      if (error instanceof PluginAuthError) {
        return NextResponse.json(
          { ok: false, error: error.message, code: "UNAUTHORIZED" },
          { status: error.status },
        );
      }
      if (error instanceof MinecraftError) {
        return NextResponse.json(
          { ok: false, error: error.message, code: error.code },
          { status: error.status },
        );
      }
      console.error("[pekoni] plugin route error:", error);
      return NextResponse.json(
        { ok: false, error: "Internal error", code: "INTERNAL" },
        { status: 500 },
      );
    }
  };
}
