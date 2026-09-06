"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useResource } from "@/lib/client/api";
import { usePlayer } from "@/components/providers/PlayerProvider";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import MobileNav from "./MobileNav";

/**
 * The application shell for the static build.
 *
 * The server build renders this frame in `(app)/layout.tsx`, where the session
 * is known before a single byte is sent. Without a server the same frame has to
 * assemble itself from the local backend, and send a signed-out visitor to the
 * sign-in page from the client.
 */
export default function AppFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { player } = usePlayer();

  const me = useResource<{ user: { role: string; status?: string } | null }>("/api/me");
  const daily = useResource<{ available: boolean }>("/api/daily", { enabled: Boolean(player) });

  useEffect(() => {
    if (!me.loading && me.data && me.data.user === null) router.replace("/login");
  }, [me.loading, me.data, router]);

  const role = me.data?.user?.role ?? player?.role ?? "USER";

  return (
    <>
      <a href="#main" className="skip-link">
        Siirry sisältöön
      </a>
      <Sidebar role={role} dailyAvailable={daily.data?.available ?? false} />
      <div className="app-main">
        <TopBar role={role} />
        <main id="main" className="app-content relative">
          {children}
        </main>
      </div>
      <MobileNav />
    </>
  );
}
