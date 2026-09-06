"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiPost, useResource } from "@/lib/client/api";
import { formatCoins, formatCompact, formatPercent, formatRelative, formatSignedCoins } from "@/lib/format";
import { hasRole, ROLES, type Role } from "@/lib/enums";
import { gameMeta } from "@/lib/games/config";
import PekoniScene from "@/components/env/PekoniScene";
import Avatar from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import {
  EmptyState,
  ErrorState,
  Eyebrow,
  Pill,
  SectionHeader,
  Skeleton,
  StatCard,
} from "@/components/ui/primitives";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { useToast } from "@/components/providers/ToastProvider";
import EconomyChart from "./EconomyChart";

type Overview = {
  days: number;
  role: Role;
  overview: {
    users: number;
    dau: number;
    wau: number;
    suspended: number;
    rounds24: number;
    coinsInCirculation: number;
    openBattles: number;
    casesOpened: number;
  };
  snapshot: {
    totalWagered: number;
    totalPayout: number;
    gameDelta: number;
    caseSpend: number;
    caseReward: number;
    dailyPaid: number;
    adminAdjust: number;
    activeUsers: number;
    rounds: number;
    roundsPerUser: number;
  };
  games: { game: string; rounds: number; wagered: number; payout: number; hold: number; rtp: number }[];
  series: { date: string; wagered: number; payout: number; rounds: number }[];
  cases: { id: string; name: string; price: number; opened: number; spent: number; returned: number }[];
  battles: { status: string; count: number }[];
  logs: {
    id: string;
    action: string;
    summary: string;
    actor: string;
    target: string | null;
    createdAt: string;
  }[];
};

type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  status: string;
  minecraftUsername: string | null;
  balance: number;
  level: number;
  gamesPlayed: number;
  totalWagered: number;
  createdAt: string;
  lastSeenAt: string;
};

type Section = "overview" | "users" | "economy" | "games" | "cases" | "battles" | "analytics" | "logs";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "chart" },
  { key: "users", label: "Users", icon: "users" },
  { key: "economy", label: "Economy", icon: "wallet" },
  { key: "games", label: "Games", icon: "games" },
  { key: "cases", label: "Cases", icon: "cases" },
  { key: "battles", label: "Battles", icon: "battles" },
  { key: "analytics", label: "Analytics", icon: "target" },
  { key: "logs", label: "Logs", icon: "logs" },
];

const RANGES = [
  { days: 7, label: "7 vrk" },
  { days: 30, label: "30 vrk" },
  { days: 3650, label: "Kaikki" },
];

export default function AdminView() {
  const [section, setSection] = useState<Section>("overview");
  const [days, setDays] = useState(7);
  const { data, error, loading, reload } = useResource<Overview>(`/api/admin/overview?days=${days}`, {
    pollMs: 30_000,
  });

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="command" variant="admin" className="h-full w-full" intensity={0.6} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 76%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Command center</Eyebrow>
            <h1 className="font-serif-display mt-2 text-[clamp(2rem,5vw,3rem)] leading-none tracking-[-0.03em]">
              Admin
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="segment">
              {RANGES.map((range) => (
                <button
                  key={range.days}
                  type="button"
                  className="segment-item"
                  data-active={days === range.days}
                  onClick={() => setDays(range.days)}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={reload} className="btn btn-ghost btn-sm" aria-label="Päivitä">
              <Icon name="refresh" size={15} />
            </button>
          </div>
        </header>

        <nav className="hide-scrollbar -mx-1 mt-6 flex gap-1.5 overflow-x-auto px-1 py-1">
          {SECTIONS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setSection(entry.key)}
              aria-pressed={section === entry.key}
              className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors ${
                section === entry.key
                  ? "border-[color-mix(in_oklab,var(--color-cyan-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-cyan-500)_12%,transparent)] text-[var(--color-cyan-400)]"
                  : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)]"
              }`}
            >
              <Icon name={entry.icon} size={14} />
              {entry.label}
            </button>
          ))}
        </nav>

        {error && !data ? (
          <div className="mt-8">
            {error.includes("käyttöoikeutta") || error.includes("oikeudet") ? (
              <EmptyState
                icon="lock"
                title="Ei käyttöoikeutta."
                description="Tämä näkymä on rajattu ylläpidolle. Palvelin tarkistaa oikeudet jokaisella pyynnöllä."
              />
            ) : (
              <ErrorState onRetry={reload} />
            )}
          </div>
        ) : loading && !data ? (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-24 rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : data ? (
          <div className="mt-7">
            {section === "overview" && <OverviewSection data={data} />}
            {section === "users" && <UsersSection role={data.role} onChanged={reload} />}
            {section === "economy" && <EconomySection data={data} />}
            {section === "games" && <GamesSection data={data} />}
            {section === "cases" && <CasesSection data={data} />}
            {section === "battles" && <BattlesSection data={data} />}
            {section === "analytics" && <AnalyticsSection data={data} />}
            {section === "logs" && <LogsSection data={data} />}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

function OverviewSection({ data }: { data: Overview }) {
  const { overview, snapshot } = data;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Käyttäjiä" value={formatCoins(overview.users)} icon={<Icon name="users" size={16} />} />
        <StatCard
          label="DAU"
          value={formatCoins(overview.dau)}
          detail={`WAU ${formatCoins(overview.wau)}`}
          accent="var(--color-cyan-400)"
          icon={<Icon name="user" size={16} />}
        />
        <StatCard
          label="Kierroksia 24 h"
          value={formatCoins(overview.rounds24)}
          accent="var(--color-emerald-400)"
          icon={<Icon name="games" size={16} />}
        />
        <StatCard
          label="Coineja kierrossa"
          value={formatCompact(overview.coinsInCirculation)}
          accent="var(--color-amber-400)"
          icon={<Icon name="coin" size={16} />}
        />
        <StatCard
          label="Panostettu"
          value={formatCompact(snapshot.totalWagered)}
          accent="var(--color-cyan-400)"
          icon={<Icon name="wallet" size={16} />}
        />
        <StatCard
          label="Maksettu ulos"
          value={formatCompact(snapshot.totalPayout)}
          accent="var(--color-mint-400)"
          icon={<Icon name="trophy" size={16} />}
        />
        <StatCard
          label="Talon kate"
          value={formatSignedCoins(snapshot.gameDelta)}
          detail={
            snapshot.totalWagered > 0
              ? `RTP ${formatPercent((snapshot.totalPayout / snapshot.totalWagered) * 100, 1)}`
              : undefined
          }
          accent={snapshot.gameDelta >= 0 ? "var(--color-emerald-400)" : "var(--color-danger-400)"}
          icon={<Icon name="chart" size={16} />}
        />
        <StatCard
          label="Jäädytettyjä"
          value={`${overview.suspended}`}
          detail={`${overview.openBattles} avointa battlea`}
          accent="var(--color-danger-400)"
          icon={<Icon name="shield" size={16} />}
        />
      </div>

      <section className="panel mt-5 p-5">
        <SectionHeader eyebrow="Talous" title="Panostettu vs. maksettu" />
        <EconomyChart series={data.series} className="mt-5" />
      </section>
    </>
  );
}

function EconomySection({ data }: { data: Overview }) {
  const { snapshot } = data;
  const rows = [
    { label: "Pelipanokset", value: -snapshot.totalWagered },
    { label: "Pelivoitot", value: snapshot.totalPayout },
    { label: "Case-ostot", value: -snapshot.caseSpend },
    { label: "Case-palkinnot", value: snapshot.caseReward },
    { label: "Daily-palkinnot", value: snapshot.dailyPaid },
    { label: "Ylläpidon muutokset", value: snapshot.adminAdjust },
  ];
  const net = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <section className="panel p-5">
        <SectionHeader eyebrow="Rahavirrat" title={`Viimeiset ${data.days > 365 ? "kaikki" : `${data.days} vrk`}`} />
        <ul className="mt-5">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between border-b border-[var(--line-soft)] py-2.5 last:border-b-0"
            >
              <span className="text-[13px] text-[var(--text-muted)]">{row.label}</span>
              <span
                className="tabular text-[14px] font-semibold"
                style={{
                  color: row.value >= 0 ? "var(--color-emerald-400)" : "var(--color-danger-400)",
                }}
              >
                {formatSignedCoins(row.value)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between rounded-[10px] bg-[var(--color-obsidian-800)] px-4 py-3">
          <span className="text-[13px] font-semibold">Nettovaikutus talouteen</span>
          <span className="tabular text-[15px] font-semibold">{formatSignedCoins(net)}</span>
        </div>
      </section>

      <section className="panel p-5">
        <SectionHeader eyebrow="Aktiivisuus" title="Pelaajaa kohden" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <StatCard label="Aktiiviset" value={formatCoins(snapshot.activeUsers)} />
          <StatCard label="Kierroksia" value={formatCoins(snapshot.rounds)} />
          <StatCard
            label="Kierroksia / pelaaja"
            value={snapshot.roundsPerUser.toFixed(1)}
            accent="var(--color-cyan-400)"
          />
          <StatCard
            label="Keskipanos"
            value={
              snapshot.rounds > 0 ? formatCoins(Math.round(snapshot.totalWagered / snapshot.rounds)) : "—"
            }
            accent="var(--color-amber-400)"
          />
        </div>
      </section>
    </div>
  );
}

function GamesSection({ data }: { data: Overview }) {
  if (data.games.length === 0) {
    return <EmptyState icon="games" title="Ei kierroksia tällä aikavälillä." />;
  }
  const max = Math.max(...data.games.map((row) => row.rounds), 1);

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--line-soft)] px-5 py-3">
        <Eyebrow>Pelit</Eyebrow>
      </div>
      <ul>
        {data.games.map((row) => (
          <li key={row.game} className="border-b border-[var(--line-soft)] px-5 py-3.5 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[140px]">
                <p className="text-[14px] font-semibold">{gameMeta(row.game)?.name ?? row.game}</p>
                <p className="tabular text-[11px] text-[var(--text-faint)]">
                  {formatCoins(row.rounds)} kierrosta
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-5 text-right">
                <Metric label="Panostettu" value={formatCompact(row.wagered)} />
                <Metric label="Maksettu" value={formatCompact(row.payout)} />
                <Metric
                  label="Kate"
                  value={formatSignedCoins(row.hold)}
                  tone={row.hold >= 0 ? "var(--color-emerald-400)" : "var(--color-danger-400)"}
                />
                <Metric label="RTP" value={formatPercent(row.rtp * 100, 1)} />
              </div>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--color-obsidian-800)]">
              <div
                className="h-full rounded-full bg-[var(--color-cyan-500)]"
                style={{ width: `${(row.rounds / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CasesSection({ data }: { data: Overview }) {
  if (data.cases.length === 0) return <EmptyState icon="cases" title="Caseja ei ole vielä avattu." />;

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--line-soft)] px-5 py-3">
        <Eyebrow>Case-avaukset</Eyebrow>
      </div>
      <ul>
        {data.cases.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line-soft)] px-5 py-3.5 last:border-b-0"
          >
            <div className="min-w-[160px]">
              <p className="text-[14px] font-semibold">{row.name}</p>
              <p className="tabular text-[11px] text-[var(--text-faint)]">
                {formatCoins(row.price)} coins / avaus
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-5 text-right">
              <Metric label="Avattu" value={formatCoins(row.opened)} />
              <Metric label="Sisään" value={formatCompact(row.spent)} />
              <Metric label="Ulos" value={formatCompact(row.returned)} />
              <Metric
                label="Kate"
                value={formatSignedCoins(row.spent - row.returned)}
                tone={
                  row.spent - row.returned >= 0 ? "var(--color-emerald-400)" : "var(--color-danger-400)"
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BattlesSection({ data }: { data: Overview }) {
  const total = data.battles.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return <EmptyState icon="battles" title="Battleja ei ole vielä pelattu." />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.battles.map((row) => (
        <StatCard
          key={row.status}
          label={row.status}
          value={formatCoins(row.count)}
          detail={`${((row.count / total) * 100).toFixed(0)} % kaikista`}
          accent="var(--color-violet-400)"
          icon={<Icon name="battles" size={16} />}
        />
      ))}
    </div>
  );
}

function AnalyticsSection({ data }: { data: Overview }) {
  const { overview, snapshot } = data;
  const stickiness = overview.wau > 0 ? overview.dau / overview.wau : 0;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="DAU" value={formatCoins(overview.dau)} accent="var(--color-cyan-400)" />
        <StatCard label="WAU" value={formatCoins(overview.wau)} accent="var(--color-cyan-400)" />
        <StatCard label="DAU / WAU" value={formatPercent(stickiness * 100, 0)} accent="var(--color-emerald-400)" />
        <StatCard
          label="Pelejä / käyttäjä"
          value={snapshot.roundsPerUser.toFixed(1)}
          accent="var(--color-amber-400)"
        />
        <StatCard label="Case-avauksia 7 vrk" value={formatCoins(overview.casesOpened)} />
        <StatCard label="Avoimia battleja" value={formatCoins(overview.openBattles)} accent="var(--color-violet-400)" />
        <StatCard label="Panostettu" value={formatCompact(snapshot.totalWagered)} />
        <StatCard
          label="Talousdelta"
          value={formatSignedCoins(snapshot.gameDelta)}
          accent={snapshot.gameDelta >= 0 ? "var(--color-emerald-400)" : "var(--color-danger-400)"}
        />
      </div>

      <section className="panel mt-5 p-5">
        <SectionHeader eyebrow="Aikasarja" title="Kierrokset ja rahavirta" />
        <EconomyChart series={data.series} className="mt-5" />
      </section>
    </>
  );
}

function LogsSection({ data }: { data: Overview }) {
  if (data.logs.length === 0) return <EmptyState icon="logs" title="Ei ylläpitotapahtumia." />;

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--line-soft)] px-5 py-3">
        <Eyebrow>Audit log · vain lisäys</Eyebrow>
      </div>
      <ul>
        {data.logs.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-soft)] px-5 py-3 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--text-dim)]">{entry.summary}</p>
              <p className="truncate text-[11px] text-[var(--text-faint)]">
                {entry.actor}
                {entry.target ? ` → ${entry.target}` : ""} · {formatRelative(entry.createdAt)}
              </p>
            </div>
            <Pill>{entry.action}</Pill>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

function UsersSection({ role, onChanged }: { role: Role; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [amount, setAmount] = useState(1000);
  const [reason, setReason] = useState("");
  const toast = useToast();
  const { player } = usePlayer();

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ users: AdminUser[] }>(
        `/api/admin/users?q=${encodeURIComponent(query)}`,
      );
      setUsers(response.users);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
    }
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const act = async (
    action: string,
    target: AdminUser,
    extra?: { amount?: number; role?: string },
  ) => {
    const labels: Record<string, string> = {
      ADD_COINS: `Lisätäänkö ${formatCoins(amount)} coins käyttäjälle ${target.username}?`,
      REMOVE_COINS: `Poistetaanko ${formatCoins(amount)} coins käyttäjältä ${target.username}?`,
      SUSPEND: `Jäädytetäänkö ${target.username}?`,
      RESTORE: `Palautetaanko ${target.username} aktiiviseksi?`,
      RESET_DAILY_COOLDOWN: `Nollataanko ${target.username}:n daily-jäähy?`,
      SET_ROLE: `Asetetaanko ${target.username}:n rooliksi ${extra?.role}?`,
    };
    if (!window.confirm(labels[action] ?? "Vahvistetaanko toiminto?")) return;

    setBusy(target.id);
    try {
      await apiPost("/api/admin/actions", {
        action,
        targetId: target.id,
        amount: extra?.amount,
        role: extra?.role,
        reason: reason.trim() || undefined,
      });
      toast.success("Toiminto suoritettu", `${action} · ${target.username}`);
      setReason("");
      await load();
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
    } finally {
      setBusy(null);
    }
  };

  const canAdjust = hasRole(role, "ADMIN");
  const canSetRole = hasRole(role, "OWNER");

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line-soft)] px-5 py-4">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Hae käyttäjiä</span>
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
          <input
            className="field pl-9"
            placeholder="Hae käyttäjänimellä tai sähköpostilla"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {canAdjust && (
          <>
            <label className="w-32">
              <span className="sr-only">Summa</span>
              <input
                className="field tabular"
                type="number"
                min={1}
                value={amount}
                onChange={(event) => setAmount(Math.max(1, Number(event.target.value)))}
              />
            </label>
            <label className="min-w-[180px] flex-1">
              <span className="sr-only">Peruste</span>
              <input
                className="field"
                placeholder="Peruste (kirjataan lokiin)"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={300}
              />
            </label>
          </>
        )}
      </div>

      {error ? (
        <ErrorState className="m-5" description={error} onRetry={load} />
      ) : users === null ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 rounded-[10px]" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon="search" title="Käyttäjiä ei löytynyt." />
      ) : (
        <ul>
          {users.map((user) => (
            <li key={user.id} className="border-b border-[var(--line-soft)] px-4 py-3.5 last:border-b-0 sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar
                  username={user.username}
                  minecraftUsername={user.minecraftUsername}
                  size={36}
                  ring={user.status !== "ACTIVE"}
                />
                <div className="min-w-[160px] flex-1">
                  <p className="flex items-center gap-2 text-[14px] font-semibold">
                    {user.username}
                    {user.id === player?.id && (
                      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                        sinä
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-faint)]">
                    Lvl {user.level} · {formatCoins(user.balance)} coins ·{" "}
                    {formatCoins(user.gamesPlayed)} peliä · nähty {formatRelative(user.lastSeenAt)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={user.role === "USER" ? "neutral" : "violet"}>{user.role}</Pill>
                  {user.status !== "ACTIVE" && <Pill tone="danger">{user.status}</Pill>}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {canAdjust && (
                  <>
                    <button
                      type="button"
                      disabled={busy === user.id}
                      onClick={() => act("ADD_COINS", user, { amount })}
                      className="btn btn-ghost btn-sm"
                    >
                      <Icon name="plus" size={13} />
                      Lisää
                    </button>
                    <button
                      type="button"
                      disabled={busy === user.id}
                      onClick={() => act("REMOVE_COINS", user, { amount })}
                      className="btn btn-ghost btn-sm"
                    >
                      <Icon name="minus" size={13} />
                      Poista
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={busy === user.id}
                  onClick={() => act("RESET_DAILY_COOLDOWN", user)}
                  className="btn btn-ghost btn-sm"
                >
                  <Icon name="refresh" size={13} />
                  Nollaa daily
                </button>
                {user.status === "ACTIVE" ? (
                  <button
                    type="button"
                    disabled={busy === user.id}
                    onClick={() => act("SUSPEND", user)}
                    className="btn btn-danger btn-sm"
                  >
                    <Icon name="lock" size={13} />
                    Jäädytä
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === user.id}
                    onClick={() => act("RESTORE", user)}
                    className="btn btn-ghost btn-sm"
                  >
                    <Icon name="check" size={13} />
                    Palauta
                  </button>
                )}
                {canSetRole && (
                  <label className="ml-auto flex items-center gap-2">
                    <span className="sr-only">Rooli</span>
                    <select
                      className="field min-h-[32px] w-auto py-1 pr-8 text-[12px]"
                      value={user.role}
                      onChange={(event) => act("SET_ROLE", user, { role: event.target.value })}
                      disabled={busy === user.id}
                    >
                      {ROLES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-[74px]">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">{label}</p>
      <p className="tabular mt-0.5 text-[13px] font-semibold" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
    </div>
  );
}
