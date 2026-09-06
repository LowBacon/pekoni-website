import type { Metadata } from "next";
import Link from "next/link";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import Wordmark from "@/components/nav/Wordmark";
import { Icon } from "@/components/ui/Icons";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Eksyit metsään | Pekoni",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-clip">
      <div className="env">
        <PekoniScene scene="wilderness" variant="404" className="h-full w-full" intensity={0.8} />
        <Atmosphere scene="wilderness" density={0.9} />
        <div className="env-fog" />
        <div className="grain" />
      </div>

      <header className="relative z-10 px-5 py-6 sm:px-10">
        <Wordmark href="/" size="sm" />
      </header>

      <main className="relative z-10 flex flex-1 items-center px-5 sm:px-10">
        <div className="mx-auto w-full max-w-lg">
          <Eyebrow>404</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.4rem,8vw,4rem)] leading-[0.95] tracking-[-0.03em]">
            Eksyit metsään.
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)]">
            Tätä polkua ei ole Pekonin kartalla. Palaa aukiolle ja valitse suunta uudestaan.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="btn btn-primary">
              Etusivulle
              <Icon name="arrowRight" size={15} />
            </Link>
            <Link href="/games-hub" className="btn btn-ghost">
              Selaa pelejä
            </Link>
          </div>
        </div>
      </main>

      <footer className="relative z-10 px-5 py-8 sm:px-10">
        <p className="text-xs text-[var(--text-faint)]">
          Kaikki Pekoni Coins -valuutta on virtuaalista eikä sillä ole rahallista arvoa.
        </p>
      </footer>
    </div>
  );
}
