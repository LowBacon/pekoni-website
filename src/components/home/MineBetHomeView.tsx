"use client";

import Link from "next/link";
import { useResource } from "@/lib/client/api";
import { GAME_CATALOG, gameMeta } from "@/lib/games/config";
import { formatCoins, formatMultiplier } from "@/lib/format";
import { levelFromXp, rankTitle } from "@/lib/progression";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import Avatar from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import {
  Coins,
  Eyebrow,
  Pill,
  ProgressBar,
  SectionHeader,
  Skeleton,
  StatCard,
  VirtualCurrencyNote,
} from "@/components/ui/primitives";
import GameTile, { FeaturedTile } from "@/components/hub/GameTile";
import ServerStatusCard from "./ServerStatusCard";
import ActivityFeed from "./ActivityFeed";

export type HomeData = {
  user: {
    id: string;
    username: string;
    minecraftUsername: string | null;
    balance: number;
    xp: number;
    level: number;
  };
  rank: number | null;
  biggest: { payout: number; bet: number; game: string; multiplier: number } | null;
  stats: {
    gamesPlayed: number;
    totalWagered: number;
    totalWon: number;
    biggestWin: number;
    winStreak: number;
    bestWinStreak: number;
  };
};

const FEATURED_ORDER = ["slots", "dice", "crash", "mines", "mobgrinder", "lasthope"];

export default function MineBetHomeView({ initial }: { initial: HomeData | null }) {
  const remote = useResource<HomeData>(initial ? null : "/api/home");
  const data = initial ?? remote.data;

  const featured = FEATURED_ORDER.map((key) => gameMeta(key)!).filter(Boolean);
  const progress = levelFromXp(data?.user.xp ?? 0);
  const stats = data?.stats;

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="minebet" variant="home" className="h-full w-full" intensity={0.9} />
        <Atmosphere scene="minebet" density={0.7} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 82%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {/* ------------------------------------------------------------ hero */}
        <section className="rise">
          <Eyebrow>Pekonin oma pelialusta</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(3rem,10vw,6rem)] leading-[0.9] tracking-[-0.03em]">
            MINEBET
          </h1>
          <p className="font-serif-display mt-2 text-[clamp(1.2rem,3vw,1.7rem)] italic text-[var(--color-mint-400)]">
            Pelaa. Kehity. Nouse huipulle.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/casino" className="btn btn-primary btn-lg">
              Pelaa nyt
              <Icon name="arrowRight" size={16} className="btn-nudge" />
            </Link>
            <Link href="/games-hub" className="btn btn-ghost btn-lg">
              Tutki pelejä
            </Link>
          </div>
        </section>

        {/* --------------------------------------------------------- balance */}
        <section className="mt-9 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <div className="panel-raised relative overflow-hidden p-6 sm:p-7">
            <div className="absolute inset-0 opacity-35">
              <PekoniScene
                scene="lodge"
                variant="balance"
                className="h-full w-full"
                vignette={false}
              />
            </div>
            <div className="relative">
              {data ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Avatar
                        username={data.user.username}
                        minecraftUsername={data.user.minecraftUsername}
                        size={56}
                        ring
                      />
                      <div className="min-w-0">
                        <p className="eyebrow">{rankTitle(progress.level)}</p>
                        <p className="mt-1 truncate text-xl font-semibold">{data.user.username}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="eyebrow">Saldo</p>
                      <Coins amount={data.user.balance} size="xl" className="mt-1" />
                      <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">Pekoni Coins</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2 flex items-baseline justify-between text-[13px]">
                      <span className="text-[var(--text-muted)]">Level {progress.level}</span>
                      <span className="tabular text-[var(--text-dim)]">
                        {formatCoins(progress.xpIntoLevel)} / {formatCoins(progress.xpForNext)} XP
                      </span>
                    </div>
                    <ProgressBar value={progress.progress} label="Tason edistyminen" />
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <Skeleton className="h-14 w-2/3" />
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-1.5 w-full" />
                </div>
              )}
            </div>
          </div>

          <div id="server">
            <ServerStatusCard />
          </div>
        </section>

        {/* ----------------------------------------------------------- stats */}
        <section className="mt-4">
          <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Games Played"
              value={formatCoins(stats?.gamesPlayed ?? 0)}
              icon={<Icon name="games" size={16} />}
            />
            <StatCard
              label="Total Wagered"
              value={formatCoins(stats?.totalWagered ?? 0)}
              accent="var(--color-cyan-400)"
              icon={<Icon name="coin" size={16} />}
            />
            <StatCard
              label="Total Won"
              value={formatCoins(stats?.totalWon ?? 0)}
              accent="var(--color-mint-400)"
              icon={<Icon name="trophy" size={16} />}
            />
            <StatCard
              label="Biggest Win"
              value={formatCoins(stats?.biggestWin ?? 0)}
              detail={
                data?.biggest && data.biggest.multiplier > 0
                  ? `${gameMeta(data.biggest.game)?.name ?? data.biggest.game} · ${formatMultiplier(data.biggest.multiplier)}`
                  : undefined
              }
              accent="var(--color-amber-400)"
              icon={<Icon name="spark" size={16} />}
            />
            <StatCard
              label="Win Streak"
              value={`${stats?.winStreak ?? 0}`}
              detail={stats?.bestWinStreak ? `Paras ${stats.bestWinStreak}` : undefined}
              accent="var(--color-emerald-400)"
              icon={<Icon name="fire" size={16} />}
            />
            <StatCard
              label="Leaderboard Rank"
              value={data?.rank ? `#${data.rank}` : "—"}
              accent="var(--color-violet-400)"
              icon={<Icon name="leaderboard" size={16} />}
            />
          </div>
        </section>

        {/* -------------------------------------------------------- featured */}
        <section className="mt-12">
          <SectionHeader
            eyebrow="Featured games"
            title="Kuusi maailmaa"
            description="Jokainen peli asuu omassa paikassaan Pekonin kartalla."
            action={
              <Link href="/games-hub" className="btn btn-ghost btn-sm">
                Kaikki pelit
                <Icon name="arrowRight" size={14} className="btn-nudge" />
              </Link>
            }
          />

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <FeaturedTile game={featured[0]} />
            <div className="grid gap-4 sm:grid-cols-2">
              {featured.slice(1, 5).map((game) => (
                <GameTile key={game.key} game={game} size="sm" />
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.slice(5).map((game) => (
              <GameTile key={game.key} game={game} />
            ))}
            {GAME_CATALOG.filter((game) => game.category === "cases").map((game) => (
              <GameTile key={game.key} game={game} />
            ))}
          </div>
        </section>

        {/* -------------------------------------------------------- activity */}
        <section className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="panel p-6">
            <SectionHeader eyebrow="Live" title="Yhteisö juuri nyt" />
            <ActivityFeed className="mt-5" limit={8} />
          </div>

          <div className="space-y-4">
            <Link
              href="/daily-case"
              className="panel group block p-6 transition-colors hover:border-[var(--line-strong)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Daily Case</Eyebrow>
                  <h3 className="font-serif-display mt-2 text-xl">Ilmainen palkinto</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    Metsäaukion huoltoarkku täyttyy joka vuorokausi. Avaa se kerran päivässä.
                  </p>
                </div>
                <Icon
                  name="daily"
                  size={22}
                  className="shrink-0 text-[var(--color-amber-400)] transition-transform group-hover:rotate-45"
                />
              </div>
            </Link>

            <Link
              href="/battles"
              className="panel group block p-6 transition-colors hover:border-[var(--line-strong)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>Case Battles</Eyebrow>
                  <h3 className="font-serif-display mt-2 text-xl">Avaa vastakkain</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    Sama case, useampi pelaaja, yksi voittaja. Kaikki avaukset tapahtuvat samaan
                    tahtiin.
                  </p>
                </div>
                <Icon name="battles" size={22} className="shrink-0 text-[var(--color-violet-400)]" />
              </div>
            </Link>

            <div className="panel p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="emerald">Virtuaalivaluutta</Pill>
                <Pill tone="cyan">Todennettavasti reilu</Pill>
              </div>
              <VirtualCurrencyNote className="mt-3.5" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
