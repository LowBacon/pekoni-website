import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IS_STATIC } from "@/lib/static/config";
import AdminView from "@/components/admin/AdminView";

export const metadata: Metadata = {
  title: "Admin | MineBet",
  description: "MineBetin ylläpidon komentokeskus.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The admin console.
 *
 * Authorisation is enforced twice, and the two checks answer different
 * questions. Every route under `/api/admin` calls `requireRole` and is the
 * control that actually protects the economy — it holds even if this page is
 * bypassed entirely, and it is what stops a crafted request.
 *
 * This check answers the softer question of what a player should be *shown*.
 * Without it the console rendered for anyone who typed the URL: a full command
 * centre where every panel resolves to "Ei käyttöoikeutta". Nothing leaked, but
 * it reads as a broken page rather than as a place they have no business being,
 * and it advertises the surface to exactly the people who should not be probing
 * it. Staff get the console; everybody else goes home.
 */
export default async function AdminPage() {
  if (!IS_STATIC) {
    const { getCurrentUser } = await import("@/server/auth");
    const { hasRole } = await import("@/lib/enums");

    const user = await getCurrentUser();
    if (!user) redirect("/login");
    if (!hasRole(user.role, "MODERATOR")) redirect("/home");
  }

  return <AdminView />;
}
