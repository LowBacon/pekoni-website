import Link from "next/link";
import { redirect } from "next/navigation";
import { IS_STATIC } from "@/lib/static/config";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import Wordmark from "@/components/nav/Wordmark";
import { Icon } from "@/components/ui/Icons";

/**
 * The sign-in shell.
 *
 * Two columns on a wide screen: what MineBet actually is on the left, the form
 * on the right. The claims are the ones the product can back — server-settled
 * rounds, a public feed, closed-loop coins — because this is the screen where a
 * player decides whether to trust it, and an unbacked promise here is worse
 * than no promise at all.
 *
 * On a phone the brand column drops entirely rather than pushing the form below
 * the fold. Somebody who tapped "sign in" wants the form.
 */

const POINTS = [
  {
    icon: "shield",
    title: "Todennettava satunnaisuus",
    body: "Palvelin sitoutuu siemeneen ennen kierrosta. Voit laskea tuloksen itse jälkikäteen.",
  },
  {
    icon: "chart",
    title: "Julkinen tuloskirjanpito",
    body: "Jokainen ratkaistu kierros näkyy live-virrassa nettotuloksineen — myös tappiot.",
  },
  {
    icon: "wallet",
    title: "Coinit peliin asti",
    body: "Siirrä Pekoni Coins Minecraft-hahmollesi. Suljettu kierto, ei rahaksi vaihtoa.",
  },
] as const;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // In the static export there is no session to read here; the sign-in form
  // sends an already-authenticated visitor onwards on the client.
  if (!IS_STATIC) {
    const { getCurrentUser } = await import("@/server/auth");
    const user = await getCurrentUser();
    if (user) redirect("/home");
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-clip">
      <div className="env">
        <PekoniScene scene="clearing" variant="auth" className="h-full w-full" />
        <Atmosphere scene="clearing" density={0.6} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 0%, transparent 30%, var(--color-obsidian-950) 96%)",
          }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-6 sm:px-10">
        <Wordmark size="sm" />
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-dim)]"
        >
          <Icon name="chevronLeft" size={15} />
          Etusivulle
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_420px]">
          {/* Brand column — desktop only. */}
          <section className="hidden lg:block">
            <p className="eyebrow">Pekoni Gaming Network</p>
            <h2 className="font-serif-display mt-4 text-[clamp(2.4rem,4.5vw,3.4rem)] leading-[0.95] tracking-[-0.03em]">
              Mine<span className="text-[var(--color-emerald-300)]">Bet</span>
            </h2>
            <p className="text-pretty mt-4 max-w-md text-[15px] leading-relaxed text-[var(--text-dim)]">
              Kierrokset ratkaistaan palvelimella, tulokset julkaistaan sellaisinaan.
            </p>

            <ul className="mt-9 space-y-5">
              {POINTS.map((point) => (
                <li key={point.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--line)] bg-[color-mix(in_oklab,var(--color-emerald-500)_10%,transparent)] text-[var(--color-emerald-300)]">
                    <Icon name={point.icon} size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--text-dim)]">{point.title}</p>
                    <p className="text-pretty mt-0.5 max-w-sm text-[13px] leading-relaxed text-[var(--text-muted)]">
                      {point.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="w-full justify-self-center lg:justify-self-end">{children}</div>
        </div>
      </main>

      <footer className="relative z-10 px-5 py-6 text-center sm:px-10">
        <p className="text-xs text-[var(--text-faint)]">
          Pekoni Coins on virtuaalivaluuttaa. Sillä ei ole rahallista arvoa eikä sitä voi lunastaa
          rahaksi.
        </p>
      </footer>
    </div>
  );
}
