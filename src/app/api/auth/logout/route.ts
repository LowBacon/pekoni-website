import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth";
import { handleError, ok } from "@/server/api";

export async function POST(request: Request) {
  try {
    await destroySession();
    // The suspended-account screen posts a plain form and expects a redirect.
    if (request.headers.get("content-type")?.includes("form")) {
      return NextResponse.redirect(new URL("/", request.url), 303);
    }
    return ok({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
