import { redirect } from "next/navigation";
import { IS_STATIC } from "@/lib/static/config";
import Sidebar from "@/components/nav/Sidebar";
import TopBar from "@/components/nav/TopBar";
import MobileNav from "@/components/nav/MobileNav";
import AppFrame from "@/components/nav/AppFrame";
import SessionEntrance from "@/components/nav/SessionEntrance";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Static export: there is no session on this side of the wire, so the shell
  // assembles itself in the browser against the local backend.
  if (IS_STATIC) return <AppFrame>{children}</AppFrame>;

  const [{ getCurrentUser, touchLastSeen }, { getDailyStatus }] = await Promise.all([
    import("@/server/auth"),
    import("@/server/daily"),
  ]);

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Presence powers the admin DAU/WAU figures, and nothing on this page waits
  // on it — so it is fired off rather than awaited, and coalesced to at most one
  // write per five minutes instead of one per navigation.
  touchLastSeen(user);

  // A suspended account never sees the shell, so the daily lookup is skipped
  // rather than thrown away.
  if (user.status === "SUSPENDED") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="panel-raised max-w-md px-8 py-10 text-center">
          <h1 className="font-serif-display text-2xl">Tili on jäädytetty</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            Tilisi käyttö on toistaiseksi estetty. Ota yhteyttä Pekoni-yhteisön ylläpitoon, jos
            uskot tämän olevan virhe.
          </p>
          <form action="/api/auth/logout" method="post" className="mt-6">
            <button type="submit" className="btn btn-ghost w-full">
              Kirjaudu ulos
            </button>
          </form>
        </div>
      </div>
    );
  }

  const daily = await getDailyStatus(user.id);

  return (
    <>
      <a href="#main" className="skip-link">
        Siirry sisältöön
      </a>
      <SessionEntrance playerId={user.id} displayName={user.displayName} />
      <Sidebar role={user.role} dailyAvailable={daily.available} />
      <div className="app-main">
        <TopBar role={user.role} />
        <main id="main" className="app-content relative">
          {children}
        </main>
      </div>
      <MobileNav />
    </>
  );
}
