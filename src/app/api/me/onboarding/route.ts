import { z } from "zod";
import { requireUser } from "@/server/auth";
import { completeOnboarding } from "@/server/account";
import { handleError, LIMITS, ok, parseBody, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

const schema = z.object({
  username: z.string().trim().min(3).max(16).optional(),
  minecraftUsername: z.string().trim().max(16).nullable().optional(),
  soundEnabled: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  publicActivity: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    requireRate(`onboarding:${user.id}`, LIMITS.write);
    const input = await parseBody(request, schema);
    return ok(await completeOnboarding(user.id, input));
  } catch (error) {
    return handleError(error);
  }
}
