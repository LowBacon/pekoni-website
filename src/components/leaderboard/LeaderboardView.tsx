"use client";

import { useState } from "react";
import { useResource } from "@/lib/client/api";
import { formatCoins } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import PekoniScene from "@/components/env/PekoniScene";
import { EmptyState, ErrorState, Eyebrow, Skeleton } from "@/components/ui/primitives";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { usePlayer } from "@/components/providers/PlayerProvider";

type Row = {
  rank: number;
  userId: string;
  username: string;
  minecraftUsername: string | null;
  level: number;
  title: string;
  value: number;
  detail: string;
};

type Payload = {
  tab: string;
  range: string;
  label: string;
  rows: Row[];
  me: Row | null;
  viewerId: string;
};

const TABS = [
  { key: "richest", label: "Richest" },
  { key: "biggest-wins", label: "Biggest Wins" },
  { key: "most-wagered", label: "Most Wagered" },
  { key: "games-played", label: "Games Played" },
  { key: "battles", label: "Case Battles" },
] as const;

const RANGES = [
  { key: "all-time", label: "All Time" },
  { key: "weekly", label: "Weekly" },
] as const;

/** Podium ordering: silver, gold, bronze — so #1 sits in the middle, raised. */
const PODIUM_LAYOUT = [1, 0, 2];

const PODIUM_STYLE = [
  { accent: "var(--color-amber-400)", scene: "vault" as const, lift: "lg:-mt-10", size: 84 },
  { accent: "var(--color-frost-300)", scene: "hall" as const, lift: "", size: 66 },
  { accent: "var(--color-amber-600)", scene: "lodge" as const, lift: "", size: 66 },
];

export default function LeaderboardView() {
  const [tab, setTab] = useState<string>("richest");
  const [range, setRange] = useState<string>("all-time");
  const { sound } = usePreferences();
  const { player } = usePlayer();

  const { data, error, loading, reload } = useResource<Payload>(
    `/api/leaderboard?tab=${tab}&range=${range}`,
    { pollMs: 60_000 },
  );

  const rows = data?.rows ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const me = data?.me ?? null;

  const select = (next: string, kind: "tab" | "range") => {
    sound("click");
    if (kind === "tab") setTab(next);
    else setRange(next);
  };

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="hide-scrollbar -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 py-1">
          {TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => select(option.key, "tab")}
              aria-pressed={tab === option.key}
              className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                tab === option.key
                  ? "border-[color-mix(in_oklab,var(--color-amber-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-amber-500)_12%,transparent)] text-[var(--color-amber-400)]"
                  : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-dim)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="segment shrink-0">
          {RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              className="segment-item"
              data-active={range === option.key}
              onClick={() => select(option.key, "range")}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && !data ? (
        <ErrorState className="mt-8" onRetry={reload} />
      ) : loading && !data ? (
        <div className="mt-8 space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-52 rounded-[var(--radius-panel)]" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon="leaderboard"
          title="Sali on vielä tyhjä."
          description="Ensimmäiset nimet kaiverretaan heti kun kierroksia on pelattu."
        />
      ) : (
        <>
          {/* ------------------------------------------------------------ podium */}
          <section className="mt-8 grid items-end gap-4 sm:grid-cols-3">
            {PODIUM_LAYOUT.map((position) => {
              const row = podium[position];
              if (!row) return <div key={position} className="hidden sm:block" />;
              const style = PODIUM_STYLE[position];
              const isFirst = position === 0;

              return (
                <article
                  key={row.userId}
                  className={`panel-raised rise relative overflow-hidden ${style.lift} ${
                    isFirst ? "order-first sm:order-none" : ""
                  }`}
                  style={{
                    boxShadow: isFirst
                      ? `var(--shadow-lift), 0 0 0 1px color-mix(in oklab, ${style.accent} 26%, transparent)`
                      : undefined,
                  }}
                >
                  <div className="absolute inset-0 opacity-40">
                    <PekoniScene
                      scene={style.scene}
                      variant={`podium-${row.userId}`}
                      className="h-full w-full"
                      vignette={false}
                    />
                  </div>
                  <div
                    className="absolute inset-x-0 top-0 h-px"
                    style={{ background: `linear-gradient(90deg, transparent, ${style.accent}, transparent)` }}
                  />

                  <div className={`relative flex flex-col items-center px-5 text-center ${isFirst ? "py-8" : "py-6"}`}>
                    <span
                      className="tabular flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: style.accent }}
                    >
                      {isFirst && <Icon name="crownStar" size={15} />}#{row.rank}
                    </span>

                    <div className="mt-4">
                      <Avatar
                        username={row.username}
                        minecraftUsername={row.minecraftUsername}
                        size={style.size}
                        ring
                      />
                    </div>

                    <h3
                      className={`mt-3.5 max-w-full truncate font-semibold tracking-[-0.015em] ${
                        isFirst ? "text-xl" : "text-[15px]"
                      }`}
                    >
                      {row.username}
                    </h3>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                      {row.title} · Lvl {row.level}
                    </p>

                    <p
                      className={`tabular mt-4 font-semibold ${isFirst ? "text-3xl" : "text-2xl"}`}
                      style={{ color: style.accent }}
                    >
                      {formatCoins(row.value)}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--text-faint)]">{row.detail}</p>
                  </div>
                </article>
              );
            })}
          </section>

          {/* ------------------------------------------------------------- table */}
          <section className="mt-6">
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-3">
                <Eyebrow>Sijat 4—{rows.length}</Eyebrow>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
                  {data?.label}
                </span>
              </div>

              {rest.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                  Vain kolme kulkijaa on toistaiseksi ehtinyt listalle.
                </p>
              ) : (
                <ul>
                  {rest.map((row) => {
                    const isMe = row.userId === player?.id;
                    return (
                      <li
                        key={row.userId}
                        className={`flex items-center gap-3.5 border-b border-[var(--line-soft)] px-4 py-3 last:border-b-0 sm:px-5 ${
                          isMe ? "bg-[color-mix(in_oklab,var(--color-emerald-500)_9%,transparent)]" : ""
                        }`}
                      >
                        <span className="tabular w-9 shrink-0 text-[13px] font-semibold text-[var(--text-faint)]">
                          #{row.rank}
                        </span>
                        <Avatar
                          username={row.username}
                          minecraftUsername={row.minecraftUsername}
                          size={32}
                          ring={isMe}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-[var(--text-dim)]">
                            {row.username}
                            {isMe && (
                              <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-emerald-400)]">
                                Sinä
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-[var(--text-faint)]">
                            {row.title} · Lvl {row.level}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="tabular text-[14px] font-semibold">{formatCoins(row.value)}</p>
                          <p className="text-[11px] text-[var(--text-faint)]">{row.detail}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {me && me.rank > 3 && (
              <div className="panel-raised mt-4 flex items-center gap-3.5 px-4 py-3.5 sm:px-5">
                <span className="tabular w-9 shrink-0 text-[13px] font-semibold text-[var(--color-emerald-400)]">
                  #{me.rank}
                </span>
                <Avatar username={me.username} minecraftUsername={me.minecraftUsername} size={34} ring />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">Sinun sijasi</p>
                  <p className="truncate text-[11px] text-[var(--text-faint)]">{me.detail}</p>
                </div>
                <p className="tabular shrink-0 text-[15px] font-semibold">{formatCoins(me.value)}</p>
              </div>
            )}

            {!me && (
              <p className="mt-4 text-center text-xs text-[var(--text-faint)]">
                Et ole vielä tällä listalla. Pelaa kierros, niin nimesi ilmestyy.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
