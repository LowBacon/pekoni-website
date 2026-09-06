import { z } from "zod";
import { requireUser } from "@/server/auth";
import { changePassword, passwordProblems } from "@/server/account";
import { clientIp, handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().max(200).nullable().optional(),
  newPassword: z.string().min(1).max(200),
});

/** Sets a first password, or changes an existing one. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    // Rate limited per account *and* per IP: this endpoint verifies a secret.
    requireRate(`password:${user.id}`, LIMITS.auth);
    requireRate(`password-ip:${clientIp(request)}`, LIMITS.auth);

    const input = await parseBody(request, schema);
    await changePassword({
      userId: user.id,
      currentPassword: input.currentPassword ?? null,
      newPassword: input.newPassword,
    });
    return ok({ ok: true, hasPassword: true });
  } catch (error) {
    return handleError(error);
  }
}

/** Live strength feedback, using the same rules the server will enforce. */
export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`password-check:${user.id}`, LIMITS.read);
    const input = await parseBody(request, z.object({ password: z.string().max(200) }));
    const problems = passwordProblems(input.password, { username: user.username });
    return ok({ ok: problems.length === 0, problems });
  } catch (error) {
    return handleError(error);
  }
}
