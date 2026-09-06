import { z } from "zod";
import { requireRole } from "@/server/auth";
import { fail, handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";
import { ADMIN_ACTIONS, AdminError, performAdminAction } from "@/server/admin";
import { ROLES } from "@/lib/enums";

const schema = z.object({
  action: z.enum(ADMIN_ACTIONS),
  targetId: z.string().min(1),
  amount: z.number().optional(),
  reason: z.string().max(300).optional(),
  role: z.enum(ROLES).optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await requireRole("MODERATOR");
    requireRate(`admin-action:${actor.id}`, LIMITS.write);

    const input = await parseBody(request, schema);

    const result = await performAdminAction({
      actorId: actor.id,
      action: input.action,
      targetId: input.targetId,
      amount: input.amount,
      reason: input.reason,
      role: input.role,
    });

    return ok(result);
  } catch (error) {
    if (error instanceof AdminError) return fail(error.message, error.status);
    return handleError(error);
  }
}
