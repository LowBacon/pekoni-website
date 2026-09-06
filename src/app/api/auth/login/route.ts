import { z } from "zod";
import { prisma } from "@/server/db";
import { createSession, verifyPassword } from "@/server/auth";
import { clientIp, fail, handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

const schema = z.object({
  username: z.string().trim().min(1, "Anna käyttäjänimi."),
  password: z.string().min(1, "Anna salasana."),
});

/** A real scrypt hash of a value nobody knows — used to equalise timing. */
const DUMMY_HASH =
  "scrypt$16384$8$1$Yb1kQ0hTZ1Z6d0ZKZFdjVw==$2ZL0uP9m6bR3xJ0kQ8nZ1cV4dF7gH2jK5lM8nP1qS4tU7wX0yZ3aC6eG9hJ2kM5nQ8rT1vY4zB7dF0gJ3lN6pS9w==";

export async function POST(request: Request) {
  try {
    requireRate(`login:${clientIp(request)}`, LIMITS.auth);
    const input = await parseBody(request, schema);

    const user = await prisma.user.findUnique({
      where: { usernameLower: input.username.toLowerCase() },
      select: {
        id: true,
        username: true,
        status: true,
        passwordHash: true,
        oauthAccounts: { select: { provider: true }, take: 2 },
      },
    });

    // Always verify something, so a missing account and a wrong password take
    // the same amount of time and cannot be told apart.
    const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

    // A provider-only account has nothing to compare against. Saying so is not
    // a leak — the account is reachable by name either way — and the alternative
    // is a player typing passwords at an account that never had one.
    if (user && !user.passwordHash) {
      // Finnish compounds the provider onto the noun, so a list has to hang the
      // suffix off every member: "Google- tai Discord-tunnuksella".
      const names = user.oauthAccounts
        .map((account) => (account.provider === "GOOGLE" ? "Google" : "Discord"))
        .join("- tai ");
      return fail(
        names
          ? `Tämä tili kirjautuu ${names}-tunnuksella.`
          : "Tällä tilillä ei ole salasanaa.",
        401,
        "NO_PASSWORD",
      );
    }

    if (!user || !valid) return fail("Väärä käyttäjänimi tai salasana.", 401, "BAD_CREDENTIALS");
    if (user.status === "SUSPENDED") return fail("Tilisi on jäädytetty.", 403, "SUSPENDED");

    await createSession(user.id, request.headers.get("user-agent") ?? undefined);
    return ok({ id: user.id, username: user.username });
  } catch (error) {
    return handleError(error);
  }
}
