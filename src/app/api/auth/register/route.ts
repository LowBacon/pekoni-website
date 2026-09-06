import { z } from "zod";
import { prisma } from "@/server/db";
import { createSession, createUser, USERNAME_PATTERN } from "@/server/auth";
import { clientIp, fail, handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

const schema = z.object({
  username: z
    .string()
    .trim()
    .regex(USERNAME_PATTERN, "Käyttäjänimi: 3–16 merkkiä, vain kirjaimia, numeroita ja _."),
  password: z.string().min(8, "Salasanan tulee olla vähintään 8 merkkiä.").max(200),
  email: z.string().trim().email("Virheellinen sähköpostiosoite.").optional().or(z.literal("")),
  minecraftUsername: z
    .string()
    .trim()
    .regex(USERNAME_PATTERN, "Minecraft-nimi: 3–16 merkkiä.")
    .optional()
    .or(z.literal("")),
});

export async function POST(request: Request) {
  try {
    requireRate(`register:${clientIp(request)}`, LIMITS.auth);
    const input = await parseBody(request, schema);

    const existing = await prisma.user.findUnique({
      where: { usernameLower: input.username.toLowerCase() },
      select: { id: true },
    });
    if (existing) return fail("Käyttäjänimi on jo varattu.", 409, "USERNAME_TAKEN");

    if (input.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (emailTaken) return fail("Sähköposti on jo käytössä.", 409, "EMAIL_TAKEN");
    }

    const user = await createUser({
      username: input.username,
      password: input.password,
      email: input.email || null,
      // Unchanged behaviour: an omitted Minecraft name mirrors the username,
      // which is what the avatar service is asked for.
      minecraftUsername: input.minecraftUsername || input.username,
    });

    await createSession(user.id, request.headers.get("user-agent") ?? undefined);

    return ok(
      { id: user.id, username: user.username, balance: user.wallet?.balance ?? 0 },
      { status: 201 },
    );
  } catch (error) {
    return handleError(error);
  }
}
