"use client";

import Link from "next/link";
import { useResource } from "@/lib/client/api";
import { levelFromXp, rankTitle } from "@/lib/progression";
import { formatCoins, formatRelative } from "@/lib/format";
import PekoniScene from "@/components/env/PekoniScene";
import LiveResults from "@/components/home/LiveResults";
import Atmosphere from "@/components/env/Atmosphere";
import Parallax from "@/components/env/Parallax";
import Wordmark from "@/components/nav/Wordmark";
import Avatar from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import {
  Coins,
  Eyebrow,
  Pill,
  ProgressBar,
  SectionHeader,
  VirtualCurrencyNote,
} from "@/components/ui/primitives";
import ServerStatusCard from "@/components/home/ServerStatusCard";
import ActivityFeed from "@/components/home/ActivityFeed";

export type LandingData = {
  totals: number;
  rank: number | null;
  daily: { available: boolean; nextAvailableAt: string | null } | null;
  user: {
    id: string;
    username: string;
    minecraftUsername: string | null;
    balance: number;
    xp: number;
    level: number;
  } | null;
  latestAchievement: { title: string; unlockedAt: string | null } | null;
};

const DESTINATIONS = [
  {
    href: "/games-hub",
    eyebrow: "Games",
    title: "Ansaitse coineja pelaamalla.",
    body: "Yksitoista peliä, jokainen omassa maailmassaan — kaivoksissa, vuorilla ja raunioissa.",
    scene: "clearing" as const,
    glow: "var(--color-emerald-500)",
  },
  {
    href: "/casino",
    eyebrow: "MineBet",
    title: "Kokeile taitoasi ja onneasi.",
    body: "Dice, Crash, Mines, Slots, Plinko, Wheel, Coinflip, Tower ja Hi-Lo — kaikki näkyvin kertoimin.",
    scene: "cavern" as const,
    glow: "var(--color-mint-500)",
  },
  {
    href: "/some",
    eyebrow: "Community",
    title: "Osallistu Pekoni-yhteisöön ja ansaitse palkintoja.",
    body: "Tapahtumat, palkinnot ja yhteisön omat caset. Pekoni rakentuu pelaajistaan.",
    scene: "lodge" as const,
    glow: "var(--color-amber-500)",
  },
];

/**
 * The front door to the Pekoni world.
 *
 * The server build hands this component its data already resolved; the static
 * build passes `initial: null` and it fetches the same payload from the local
 * backend. The markup is identical either way.
 */
export default function LandingView({ initial }: { initial: LandingData | null }) {
  const remote = useResource<LandingData>(initial ? null : "/api/landing");
  const data = initial ?? remote.data;

  const user = data?.user ?? null;
  const daily = data?.daily ?? null;
  const rank = data?.rank ?? null;
  const totals = data?.totals ?? null;
  const latestAchievement = data?.latestAchievement ?? null;
  const progress = user ? levelFromXp(user.xp) : null;

  return (
    <div className="relative min-h-dvh overflow-clip">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative isolate flex min-h-[100svh] flex-col">
        <div className="env">
          <Parallax speed={0.12} pointer={16} className="absolute inset-0 -top-[8%] h-[118%]">
            <PekoniScene scene="wilderness" variant="hero" className="h-full w-full" />
          </Parallax>
          <Atmosphere scene="wilderness" density={1.3} />
          <div className="env-fog" />
          <div className="grain" />
          <div
            className="absolute inset-x-0 bottom-0 h-64"
            style={{
              background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 92%)",
            }}
          />
        </div>

        <header className="relative z-10 flex items-center justify-between px-5 py-6 sm:px-10">
          <Wordmark href={null} size="md" />
          <nav className="flex items-center gap-2">
            {user ? (
              <Link href="/home" className="btn btn-primary btn-sm">
                Jatka maailmaan
                <Icon name="arrowRight" size={15} className="btn-nudge" />
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">
                  Kirjaudu
                </Link>
                <Link href="/register" className="btn btn-primary btn-sm">
                  Luo tili
                </Link>
              </>
            )}
          </nav>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-16 pt-8 sm:px-10">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="max-w-2xl">
              <Eyebrow className="rise">Pekoni Gaming Network</Eyebrow>

              {/*
                The wordmark is the product, not the community that hosts it.
                "MineBet" is what a player types into a browser and what the
                live feed, the wallet and the receipts all say, so it is what
                the first screen says too.
              */}
              <h1 className="font-serif-display rise mt-5 text-[clamp(3.2rem,12vw,8rem)] leading-[0.84] tracking-[-0.035em]">
                Mine
                <span className="text-[var(--color-emerald-300)]">Bet</span>
              </h1>

              <p
                className="font-serif-display rise mt-4 text-[clamp(1.3rem,3.4vw,2rem)] italic leading-tight text-[var(--color-cyan-300)]"
                style={{ animationDelay: "80ms" }}
              >
                Jokainen kierros näkyvissä.
              </p>

              <p
                className="text-pretty rise mt-6 max-w-lg text-[15px] leading-relaxed text-[var(--text-dim)] sm:text-base"
                style={{ animationDelay: "140ms" }}
              >
                Palvelinpuolella ratkaistut kierrokset, todennettava satunnaisuus ja
                julkinen tulosvirta. Pekoni Coins on suljetun kierron pelivaluutta —
                voit siirtää sen Minecraft-hahmollesi, mutta et vaihtaa rahaksi.
              </p>

              <div
                className="rise mt-9 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "200ms" }}
              >
                <Link href={user ? "/home" : "/register"} className="btn btn-primary btn-lg">
                  {user ? "Jatka pelaamista" : "Luo tili"}
                  <Icon name="arrowRight" size={16} className="btn-nudge" />
                </Link>
                <a href="#live" className="btn btn-cyan btn-lg">
                  Katso live-tulokset
                </a>
              </div>

              <ul
                className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--text-faint)]"
                style={{ animationDelay: "260ms" }}
              >
                <li className="flex items-center gap-1.5">
                  <Icon name="shield" size={13} />
                  Todennettava satunnaisuus
                </li>
                <li className="flex items-center gap-1.5">
                  <Icon name="chart" size={13} />
                  Julkinen tuloskirjanpito
                </li>
                {totals !== null && (
                  <li className="flex items-center gap-1.5">
                    <Icon name="users" size={13} />
                    {totals === 1 ? "1 pelaaja" : `${formatCoins(totals)} pelaajaa`}
                  </li>
                )}
              </ul>
            </div>

            {/* Artwork breathing room on wide screens; the feed has its own
                section below so every viewport gets it, not just desktop. */}
            <div className="hidden lg:block" aria-hidden="true" />
          </div>
        </div>

        <div
          className="relative z-10 flex justify-center pb-8 text-[var(--text-faint)]"
          aria-hidden="true"
        >
          <Icon name="chevronDown" size={20} className="animate-bounce" />
        </div>
      </section>

      {/*
        The live feed, public and unauthenticated.

        This is the clearest statement the product can make about itself: real
        settled rounds, readable before anyone creates an account. Privacy is
        enforced in the API, so a player who has hidden their identity reads as
        "Hidden player" here exactly as they do everywhere else.
      */}
      <section id="live" className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        <LiveResults compact />
      </section>

      {/* ------------------------------------------------------- player + world */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        {user && progress ? (
          <div className="panel-raised rise relative -mt-24 overflow-hidden">
            <div className="absolute inset-0 opacity-40">
              <PekoniScene
                scene="lodge"
                variant="playercard"
                className="h-full w-full"
                vignette={false}
              />
            </div>
            <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.35fr_1fr]">
              <div>
                <div className="flex items-center gap-4">
                  <Avatar
                    username={user.username}
                    minecraftUsername={user.minecraftUsername}
                    size={64}
                    ring
                  />
                  <div className="min-w-0">
                    <p className="eyebrow">{rankTitle(progress.level)}</p>
                    <h2 className="mt-1 truncate text-2xl font-semibold tracking-[-0.02em]">
                      {user.username}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Pill tone="emerald">Level {progress.level}</Pill>
                      {rank && <Pill tone="amber">#{rank} rikkain</Pill>}
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex items-baseline justify-between text-[13px]">
                    <span className="text-[var(--text-muted)]">Kokemus</span>
                    <span className="tabular text-[var(--text-dim)]">
                      {formatCoins(progress.xpIntoLevel)} / {formatCoins(progress.xpForNext)} XP
                    </span>
                  </div>
                  <ProgressBar value={progress.progress} label="Tason edistyminen" />
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-card)] border border-[var(--line-soft)] bg-[color-mix(in_oklab,var(--color-obsidian-900)_70%,transparent)] px-4 py-3">
                    <p className="eyebrow text-[10px]">Saldo</p>
                    <Coins amount={user.balance} size="lg" className="mt-1.5" />
                  </div>
                  <Link
                    href="/daily-case"
                    className="group rounded-[var(--radius-card)] border border-[var(--line-soft)] bg-[color-mix(in_oklab,var(--color-obsidian-900)_70%,transparent)] px-4 py-3 transition-colors hover:border-[var(--line-strong)]"
                  >
                    <p className="eyebrow text-[10px]">Daily Case</p>
                    <p className="mt-1.5 flex items-center gap-2 text-[15px] font-semibold">
                      {daily?.available ? (
                        <>
                          <span className="size-1.5 rounded-full bg-[var(--color-amber-400)]" />
                          <span className="text-[var(--color-amber-400)]">Avattavissa</span>
                        </>
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          {daily?.nextAvailableAt
                            ? `Uudelleen ${formatRelative(daily.nextAvailableAt)}`
                            : "Avattavissa"}
                        </span>
                      )}
                    </p>
                  </Link>
                </div>

                {latestAchievement && (
                  <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--color-amber-500)_20%,transparent)] bg-[color-mix(in_oklab,var(--color-amber-500)_6%,transparent)] px-4 py-3">
                    <Icon name="trophy" size={18} className="shrink-0 text-[var(--color-amber-400)]" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[var(--text-dim)]">
                        {latestAchievement.title}
                      </p>
                      <p className="truncate text-[11px] text-[var(--text-faint)]">
                        Viimeisin saavutus ·{" "}
                        {latestAchievement.unlockedAt
                          ? formatRelative(latestAchievement.unlockedAt)
                          : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <ServerStatusCard compact />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="panel-raised rise relative -mt-24 overflow-hidden p-7 sm:p-9">
              <div className="absolute inset-0 opacity-45">
                <PekoniScene
                  scene="clearing"
                  variant="guest"
                  className="h-full w-full"
                  vignette={false}
                />
              </div>
              <div className="relative">
                <Eyebrow>Aloita tästä</Eyebrow>
                <h2 className="font-serif-display mt-3 text-3xl leading-tight">
                  Luo hahmosi ja astu metsään.
                </h2>
                <p className="text-pretty mt-3 max-w-md text-sm leading-relaxed text-[var(--text-muted)]">
                  Uudet kulkijat saavat 1 000 Pekoni Coinsia matkaevääksi. Liitä halutessasi
                  Minecraft-nimesi, niin hahmosi pää seuraa mukana koko maailmaan.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href="/register" className="btn btn-primary">
                    Luo tili
                    <Icon name="arrowRight" size={15} className="btn-nudge" />
                  </Link>
                  <Link href="/login" className="btn btn-ghost">
                    Minulla on jo tili
                  </Link>
                </div>
              </div>
            </div>
            <div className="rise -mt-24 lg:mt-0">
              <ServerStatusCard />
            </div>
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- destinations */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        <SectionHeader
          eyebrow="Kolme suuntaa"
          title="Pekonin maailmat"
          description="Jokainen alue on oma paikkansa — omalla valollaan, säällään ja äänimaailmallaan."
        />

        <div className="stagger mt-8 grid gap-4 md:grid-cols-3">
          {DESTINATIONS.map((destination) => (
            <Link
              key={destination.href}
              href={destination.href}
              className="tile group relative flex min-h-[300px] flex-col justify-end overflow-hidden p-6"
              style={{ ["--tile-glow" as string]: destination.glow }}
            >
              <div className="tile-art absolute inset-0">
                <PekoniScene
                  scene={destination.scene}
                  variant={destination.href}
                  className="h-full w-full"
                />
              </div>
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, var(--color-obsidian-950) 8%, color-mix(in oklab, var(--color-obsidian-950) 55%, transparent) 45%, transparent 78%)",
                }}
              />
              <div className="relative">
                <Eyebrow>{destination.eyebrow}</Eyebrow>
                <h3 className="text-pretty mt-2.5 text-lg font-semibold leading-snug">
                  {destination.title}
                </h3>
                <p className="text-pretty mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  {destination.body}
                </p>
                <span className="tile-cta mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-emerald-400)]">
                  Siirry
                  <Icon name="arrowRight" size={14} className="btn-nudge" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------- ambient */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-24 sm:px-10">
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <div className="panel relative overflow-hidden p-6">
            <div className="absolute inset-0 opacity-30">
              <PekoniScene scene="hall" variant="ambient" className="h-full w-full" vignette={false} />
            </div>
            <div className="relative">
              <SectionHeader eyebrow="Maailmassa juuri nyt" title="Elävä metsä" />
              <ActivityFeed className="mt-5" limit={7} />
            </div>
          </div>

          <div className="space-y-5">
            <div className="panel p-6">
              <Eyebrow>Pekoni Coins</Eyebrow>
              <h3 className="font-serif-display mt-2.5 text-xl">Virtuaalinen valuutta</h3>
              <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                Coinit ansaitaan pelaamalla, kehittymällä ja osallistumalla yhteisöön. Ne avaavat
                caseja, battleja ja kosmetiikkaa Pekonin sisällä.
              </p>
              <div className="rule my-5" />
              <VirtualCurrencyNote />
            </div>

            <div className="panel p-6">
              <Eyebrow>Reilu peli</Eyebrow>
              <h3 className="font-serif-display mt-2.5 text-xl">Todennettavasti reilu</h3>
              <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                Jokaisen kierroksen lopputulos johdetaan palvelimen siemenestä, jonka tiiviste
                näytetään etukäteen. Voit vaihtaa siemenen milloin tahansa ja tarkistaa vanhat
                kierrokset jälkikäteen.
              </p>
              <Link
                href="/settings#fairness"
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-emerald-400)]"
              >
                Lue lisää
                <Icon name="arrowRight" size={14} className="btn-nudge" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--line-soft)] px-5 py-10 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <Wordmark href={null} size="sm" />
          <p className="max-w-md text-xs leading-relaxed text-[var(--text-faint)]">
            Pekoni on itsenäinen yhteisöprojekti. Ei yhteydessä Mojang Studiosiin tai Microsoftiin.
            Kaikki Pekoni Coins -valuutta on virtuaalista.
          </p>
        </div>
      </footer>
    </div>
  );
}
