import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IS_STATIC } from "@/lib/static/config";
import AdminView from "@/components/admin/AdminView";

export const metadata: Metadata = {
  title: "Admin | MineBet",
  description: "MineBetin ylläpidon komentokeskus.",
  robots: { index: false, follow: false },
};

/*
  There is deliberately no `export const dynamic` here.

  The server build does not need one: the guard below reads the session cookie,
  and reading cookies opts a route into dynamic rendering on its own, so the
  page is never prerendered or cached across players.

  Declaring `force-dynamic` anyway broke the static export, which is the same
  source tree built with `output: "export"` — that mode refuses any
  force-dynamic route, because there is no server to render it on. It refuses a
  conditional value too; the field is read from the syntax tree, not evaluated,
  so a ternary on the build mode fails to parse. Saying nothing satisfies both:
  the static build skips the guard entirely and prerenders the shell, and the
  demo backend in the browser answers the admin API itself (it grants the demo
  user OWNER on purpose, so the console stays explorable).
*/

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
