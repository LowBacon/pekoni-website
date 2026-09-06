"use client";

import { useState } from "react";
import Link from "next/link";
import { useResource } from "@/lib/client/api";
import {
  formatCoins,
  formatDate,
  formatMultiplier,
  formatRelative,
  formatSignedCoins,
} from "@/lib/format";
import { TRANSACTION_LABELS, type TransactionType } from "@/lib/enums";
import { gameMeta } from "@/lib/games/config";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import Avatar from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import {
  Coins,
  EmptyState,
  ErrorState,
  Eyebrow,
  Pill,
  ProgressBar,
  RarityChip,
  SectionHeader,
  Skeleton,
  StatCard,
} from "@/components/ui/primitives";
import AchievementBadge from "./AchievementBadge";

type Achievement = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  target: number;
  progress: number;
  xpReward: number;
  coinReward: number;
  unlockedAt: string | null;
};

type Payload = {
  user: {
    id: string;
    username: string;
    role: string;
    minecraftUsername: string | null;
    balance: number;
    level: number;
    xp: number;
    title: string;
    createdAt: string;
  };
  progress: { level: number; xpIntoLevel: number; xpForNext: number; progress: number };
  rank: number | null;
  daily: { available: boolean; streak: number; totalClaimed: number };
  fairness: { serverSeedHash: string; clientSeed: string; nonce: number };
  stats: Record<string, number>;
  achievements: Achievement[];
  rounds: {
    id: string;
    game: string;
    bet: number;
    payout: number;
    multiplier: number;
    outcome: string;
    createdAt: string;
  }[];
  transactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    source: string;
    createdAt: string;
  }[];
  openings: {
    id: string;
    caseName: string;
    item: { name: string; rarity: string; icon: string; value: number };
    cost: number;
    createdAt: string;
  }[];
  battles: {
    id: string;
    caseName: string;
    mode: string;
    status: string;
    entryCost: number;
    total: number;
    payout: number;
    isWinner: boolean;
    joinedAt: string;
  }[];
};

type Tab = "history" | "transactions" | "cases" | "battles";

const TABS: { key: Tab; label: string }[] = [
  { key: "history", label: "Pelihistoria" },
  { key: "transactions", label: "Tapahtumat" },
  { key: "cases", label: "Caset" },
  { key: "battles", label: "Battlet" },
];

export default function ProfileView() {
  const [tab, setTab] = useState<Tab>("history");
  const { data, error, loading, reload } = useResource<Payload>("/api/profile");

  const unlocked = data?.achievements.filter((entry) => entry.unlockedAt).length ?? 0;

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="lodge" variant="profile" className="h-full w-full" intensity={0.9} />
        <Atmosphere scene="lodge" density={0.55} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 80%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        {error && !data ? (
          <ErrorState onRetry={reload} />
        ) : loading || !data ? (
          <ProfileSkeleton />
        ) : (
          <>
            {/* --------------------------------------------------------- hero */}
            <section className="panel-raised rise relative overflow-hidden">
              <div className="absolute inset-0 opacity-45">
                <PekoniScene
                  scene="lodge"
                  variant={`hero-${data.user.id}`}
                  className="h-full w-full"
                  vignette={false}
                />
              </div>
              <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.5fr_1fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-5">
                    <Avatar
                      username={data.user.username}
                      minecraftUsername={data.user.minecraftUsername}
                      size={92}
                      ring
                    />
                    <div className="min-w-0">
                      <Eyebrow>{data.user.title}</Eyebrow>
                      <h1 className="font-serif-display mt-1.5 truncate text-[clamp(1.9rem,5vw,2.6rem)] leading-tight tracking-[-0.02em]">
                        {data.user.username}
                      </h1>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <Pill tone="emerald">Level {data.progress.level}</Pill>
                        {data.rank && <Pill tone="amber">#{data.rank} rikkain</Pill>}
                        {data.user.role !== "USER" && <Pill tone="violet">{data.user.role}</Pill>}
                        {data.user.minecraftUsername && (
                          <Pill tone="cyan">MC: {data.user.minecraftUsername}</Pill>
                        )}
                      </div>
                      <p className="mt-2.5 text-xs text-[var(--text-faint)]">
                        Liittyi {formatDate(data.user.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-7">
                    <div className="mb-2 flex items-baseline justify-between text-[13px]">
                      <span className="text-[var(--text-muted)]">
                        Level {data.progress.level} → {data.progress.level + 1}
                      </span>
                      <span className="tabular text-[var(--text-dim)]">
                        {formatCoins(data.progress.xpIntoLevel)} / {formatCoins(data.progress.xpForNext)} XP
                      </span>
                    </div>
                    <ProgressBar value={data.progress.progress} label="Tason edistyminen" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-[var(--radius-card)] border border-[var(--line-soft)] bg-[color-mix(in_oklab,var(--color-obsidian-900)_72%,transparent)] px-5 py-4">
                    <p className="eyebrow text-[10px]">Saldo</p>
                    <Coins amount={data.user.balance} size="xl" className="mt-1.5" />
                    <p className="mt-1 text-[11px] text-[var(--text-faint)]">Pekoni Coins</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[var(--radius-card)] border border-[var(--line-soft)] px-4 py-3">
                      <p className="eyebrow text-[10px]">Saavutukset</p>
                      <p className="tabular mt-1.5 text-lg font-semibold">
                        {unlocked}
                        <span className="text-[var(--text-faint)]">/{data.achievements.length}</span>
                      </p>
                    </div>
                    <Link
                      href="/daily-case"
                      className="rounded-[var(--radius-card)] border border-[var(--line-soft)] px-4 py-3 transition-colors hover:border-[var(--line-strong)]"
                    >
                      <p className="eyebrow text-[10px]">Daily streak</p>
                      <p className="tabular mt-1.5 text-lg font-semibold">
                        {data.daily.streak}
                        <span className="ml-1 text-[11px] font-normal text-[var(--text-faint)]">
                          {data.daily.available ? "· avattavissa" : "vrk"}
                        </span>
                      </p>
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {/* -------------------------------------------------------- stats */}
            <section className="mt-8">
              <SectionHeader eyebrow="Statistics" title="Kaikki mitä olet tehnyt" />
              <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <StatCard
                  label="Games Played"
                  value={formatCoins(data.stats.gamesPlayed)}
                  icon={<Icon name="games" size={16} />}
                />
                <StatCard
                  label="Coins Wagered"
                  value={formatCoins(data.stats.totalWagered)}
                  accent="var(--color-cyan-400)"
                  icon={<Icon name="coin" size={16} />}
                />
                <StatCard
                  label="Coins Won"
                  value={formatCoins(data.stats.totalWon)}
                  accent="var(--color-mint-400)"
                  icon={<Icon name="trophy" size={16} />}
                />
                <StatCard
                  label="Net Profit"
                  value={formatSignedCoins(data.stats.netProfit)}
                  accent={
                    data.stats.netProfit >= 0 ? "var(--color-emerald-400)" : "var(--color-danger-400)"
                  }
                  icon={<Icon name="chart" size={16} />}
                />
                <StatCard
                  label="Biggest Win"
                  value={formatCoins(data.stats.biggestWin)}
                  accent="var(--color-amber-400)"
                  icon={<Icon name="spark" size={16} />}
                />
                <StatCard
                  label="Highest Crash"
                  value={data.stats.highestCrash > 0 ? formatMultiplier(data.stats.highestCrash) : "—"}
                  accent="var(--color-cyan-400)"
                  icon={<Icon name="bolt" size={16} />}
                />
                <StatCard
                  label="Best Mines"
                  value={data.stats.bestMinesMult > 0 ? formatMultiplier(data.stats.bestMinesMult) : "—"}
                  accent="var(--color-mint-400)"
                  icon={<Icon name="diamond" size={16} />}
                />
                <StatCard
                  label="Cases Opened"
                  value={formatCoins(data.stats.casesOpened)}
                  accent="var(--color-amber-400)"
                  icon={<Icon name="cases" size={16} />}
                />
                <StatCard
                  label="Battles Won"
                  value={`${data.stats.battlesWon}`}
                  detail={`${data.stats.battlesPlayed} pelattu`}
                  accent="var(--color-violet-400)"
                  icon={<Icon name="battles" size={16} />}
                />
                <StatCard
                  label="Leaderboard"
                  value={data.rank ? `#${data.rank}` : "—"}
                  accent="var(--color-emerald-400)"
                  icon={<Icon name="leaderboard" size={16} />}
                />
              </div>
            </section>

            {/* ------------------------------------------------- achievements */}
            <section className="mt-12">
              <SectionHeader
                eyebrow="Achievements"
                title="Pekonin tunnukset"
                description="Jokainen tunnus kaiverretaan kun sen ehto täyttyy. Etenemä päivittyy pelatessa."
                action={
                  <span className="tabular text-[13px] font-semibold text-[var(--text-muted)]">
                    {unlocked} / {data.achievements.length}
                  </span>
                }
              />
              {data.achievements.length === 0 ? (
                <EmptyState
                  className="mt-6"
                  icon="trophy"
                  title="Saavutuksia ei ole vielä määritelty."
                />
              ) : (
                <div className="stagger mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.achievements.map((achievement) => (
                    <AchievementBadge key={achievement.slug} achievement={achievement} />
                  ))}
                </div>
              )}
            </section>

            {/* ------------------------------------------------------ history */}
            <section className="mt-12" id="wallet">
              <SectionHeader eyebrow="History" title="Viimeisimmät" />

              <div className="mt-5 flex flex-wrap gap-1.5">
                {TABS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTab(option.key)}
                    aria-pressed={tab === option.key}
                    className={`min-h-[36px] rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                      tab === option.key
                        ? "border-[color-mix(in_oklab,var(--color-emerald-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-emerald-500)_13%,transparent)] text-[var(--color-emerald-300)]"
                        : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-dim)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="panel mt-4 overflow-hidden">
                {tab === "history" &&
                  (data.rounds.length === 0 ? (
                    <EmptyState
                      icon="history"
                      title="Et ole vielä pelannut yhtään peliä."
                      description="Ensimmäinen kierroksesi ilmestyy tähän heti sen jälkeen."
                      action={
                        <Link href="/games-hub" className="btn btn-primary btn-sm">
                          Valitse peli
                        </Link>
                      }
                    />
                  ) : (
                    <ul>
                      {data.rounds.map((round) => {
                        const win = round.payout > round.bet;
                        return (
                          <li
                            key={round.id}
                            className="flex items-center gap-3.5 border-b border-[var(--line-soft)] px-4 py-3 last:border-b-0 sm:px-5"
                          >
                            <span
                              className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                color: win ? "var(--color-emerald-400)" : "var(--text-faint)",
                                background: win
                                  ? "color-mix(in oklab, var(--color-emerald-500) 13%, transparent)"
                                  : "var(--color-obsidian-800)",
                              }}
                            >
                              <Icon name="games" size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-semibold text-[var(--text-dim)]">
                                {gameMeta(round.game)?.name ?? round.game}
                              </p>
                              <p className="text-[11px] text-[var(--text-faint)]">
                                {formatRelative(round.createdAt)} · panos {formatCoins(round.bet)}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <Coins amount={round.payout - round.bet} signed size="sm" showMark={false} />
                              <p className="tabular text-[11px] text-[var(--text-faint)]">
                                {round.multiplier > 0 ? formatMultiplier(round.multiplier) : "—"}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ))}

                {tab === "transactions" &&
                  (data.transactions.length === 0 ? (
                    <EmptyState icon="wallet" title="Ei tapahtumia vielä." />
                  ) : (
                    <ul>
                      {data.transactions.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center gap-3.5 border-b border-[var(--line-soft)] px-4 py-3 last:border-b-0 sm:px-5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-[var(--text-dim)]">
                              {TRANSACTION_LABELS[entry.type as TransactionType] ?? entry.type}
                            </p>
                            <p className="truncate text-[11px] text-[var(--text-faint)]">
                              {formatRelative(entry.createdAt)} · {entry.source}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Coins amount={entry.amount} signed size="sm" showMark={false} />
                            <p className="tabular text-[11px] text-[var(--text-faint)]">
                              saldo {formatCoins(entry.balanceAfter)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ))}

                {tab === "cases" &&
                  (data.openings.length === 0 ? (
                    <EmptyState
                      icon="cases"
                      title="Et ole avannut yhtään casea."
                      action={
                        <Link href="/caser" className="btn btn-primary btn-sm">
                          Avaa ensimmäinen
                        </Link>
                      }
                    />
                  ) : (
                    <ul>
                      {data.openings.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center gap-3.5 border-b border-[var(--line-soft)] px-4 py-3 last:border-b-0 sm:px-5"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-obsidian-800)] text-[var(--text-dim)]">
                            <Icon name={entry.item.icon} size={17} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-[var(--text-dim)]">
                              {entry.item.name}
                            </p>
                            <p className="truncate text-[11px] text-[var(--text-faint)]">
                              {entry.caseName} · {formatRelative(entry.createdAt)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <RarityChip rarity={entry.item.rarity as never} />
                            <Coins
                              amount={entry.item.value - entry.cost}
                              signed
                              size="sm"
                              showMark={false}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ))}

                {tab === "battles" &&
                  (data.battles.length === 0 ? (
                    <EmptyState
                      icon="battles"
                      title="Et ole osallistunut battleen."
                      action={
                        <Link href="/battles" className="btn btn-primary btn-sm">
                          Katso avoimet
                        </Link>
                      }
                    />
                  ) : (
                    <ul>
                      {data.battles.map((entry) => (
                        <li
                          key={entry.id}
                          className="flex items-center gap-3.5 border-b border-[var(--line-soft)] px-4 py-3 last:border-b-0 sm:px-5"
                        >
                          <span
                            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              color: entry.isWinner ? "var(--color-amber-400)" : "var(--text-faint)",
                              background: entry.isWinner
                                ? "color-mix(in oklab, var(--color-amber-500) 13%, transparent)"
                                : "var(--color-obsidian-800)",
                            }}
                          >
                            <Icon name={entry.isWinner ? "crown" : "battles"} size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-[var(--text-dim)]">
                              {entry.caseName}
                            </p>
                            <p className="truncate text-[11px] text-[var(--text-faint)]">
                              {entry.mode} · {formatRelative(entry.joinedAt)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Coins
                              amount={entry.payout - entry.entryCost}
                              signed
                              size="sm"
                              showMark={false}
                            />
                            <p className="tabular text-[11px] text-[var(--text-faint)]">
                              avattu {formatCoins(entry.total)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            </section>

            <section className="mt-8">
              <div className="panel flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <Eyebrow>Provably fair</Eyebrow>
                  <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
                    Nykyisen siemenen tiiviste ·{" "}
                    <span className="font-mono text-[11px] text-[var(--text-dim)]">
                      {data.fairness.serverSeedHash.slice(0, 24)}…
                    </span>
                  </p>
                </div>
                <Link href="/settings#fairness" className="btn btn-ghost btn-sm">
                  Hallitse siemeniä
                  <Icon name="arrowRight" size={14} className="btn-nudge" />
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-56 rounded-[var(--radius-panel)]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-[var(--radius-card)]" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-[var(--radius-card)]" />
        ))}
      </div>
    </div>
  );
}
