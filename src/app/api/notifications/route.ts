import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { handleError, LIMITS, ok, requireRate } from "@/server/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    requireRate(`notif:${user.id}`, LIMITS.read);

    const notifications = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return ok({
      notifications: notifications.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        href: item.href,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
