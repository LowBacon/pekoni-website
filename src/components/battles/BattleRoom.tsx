"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost, useResource } from "@/lib/client/api";
import { formatCoins } from "@/lib/format";
import { BATTLE_MODE_META, RARITY_META, type BattleMode, type Rarity } from "@/lib/enums";
import PekoniScene from "@/components/env/PekoniScene";
import Avatar from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icons";
import { Coins, ErrorState, Eyebrow, Pill, Skeleton } from "@/components/ui/primitives";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";

type Draw = {
  roundNumber: number;
  participantId: string;
  item: { id: string; name: string; rarity: string; icon: string; value: number };
};

type BattleView = {
  id: string;
  mode: BattleMode;
  status: string;
  rounds: number;
  slots: number;
  entryCost: number;
  prizePool: number | null;
  createdAt: string;
  creator: string;
  case: { id: string; slug: string; name: string; price: number; theme: string };
  startsAt: number | null;
  finishesAt: number | null;
  revealedRounds: number;
  participants: {
    id: string;
    slot: number;
    team: number;
    isBot: boolean;
    userId: string | null;
    username: string;
    minecraftUsername: string | null;
    total: number;
    payout: number | null;
    isWinner: boolean | null;
  }[];
  draws: Draw[];
};

/**
 * One battle, watched live.
 *
 * Rounds are released by the server on a shared clock — polling only asks what
 * has already been revealed, so every participant sees the same item at the
 * same moment and nobody can read ahead.
 */
export default function BattleRoom({ battleId, onExit }: { battleId: string; onExit: () => void }) {
  const { player, refresh } = usePlayer();
  const { sound } = usePreferences();
  const toast = useToast();
  const [joining, setJoining] = useState(false);

  const live = useRef(true);
  const { data, error, loading, reload } = useResource<BattleView>(`/api/battles/${battleId}`, {
    pollMs: 900,
  });

  const status = data?.status;
  const finished = status === "FINISHED" || status === "CANCELLED";
  live.current = !finished;

  const seenRounds = useRef(0);
  const celebrated = useRef(false);

  // Sound follows the reveal clock rather than the poll.
  useEffect(() => {
    if (!data) return;
    if (data.revealedRounds > seenRounds.current) {
      seenRounds.current = data.revealedRounds;
      if (data.revealedRounds > 0 && !finished) sound("reelStop");
    }
    if (finished && !celebrated.current) {
      celebrated.current = true;
      // The payout landed server-side while the reveal was playing.
      void refresh();
      const mine = data.participants.find((entry) => entry.userId === player?.id);
      if (mine?.isWinner) {
        sound("bigWin");
        toast.reward("Battle voitettu", `+${formatCoins(mine.payout ?? 0)} coins`);
      } else if (mine) {
        sound("lose");
      }
    }
  }, [data, finished, player?.id, sound, toast, refresh]);

  const countdown = useCountdown(data?.startsAt ?? null);

  const byParticipant = useMemo(() => {
    const map = new Map<string, Draw[]>();
    for (const draw of data?.draws ?? []) {
      const list = map.get(draw.participantId) ?? [];
      list.push(draw);
      map.set(draw.participantId, list);
    }
    return map;
  }, [data?.draws]);

  const alreadyIn = data?.participants.some((entry) => entry.userId === player?.id) ?? false;
  const openSeats = (data?.slots ?? 0) - (data?.participants.length ?? 0);

  const join = async () => {
    if (!data || joining) return;
    setJoining(true);
    try {
      await apiPost(`/api/battles/${data.id}/join`, {});
      sound("bet");
      toast.success("Liityit battleen", `${formatCoins(data.entryCost)} coins`);
      await refresh();
      reload();
    } catch (cause) {
      sound("error");
      toast.error(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
    } finally {
      setJoining(false);
    }
  };

  if (error && !data) return <ErrorState className="mt-8" onRetry={reload} />;
  if (loading || !data) return <Skeleton className="mt-8 h-[480px] rounded-[var(--radius-panel)]" />;

  const winners = data.participants.filter((entry) => entry.isWinner);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onExit} className="btn btn-ghost btn-sm">
          <Icon name="chevronLeft" size={15} />
          Kaikki battlet
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={data.mode === "CRAZY" ? "danger" : data.mode === "TEAM" ? "cyan" : "emerald"}>
            {BATTLE_MODE_META[data.mode]?.label ?? data.mode}
          </Pill>
          <Pill>{data.rounds} kierrosta</Pill>
          <Pill tone="amber">{formatCoins(data.entryCost)} / paikka</Pill>
        </div>
      </div>

      <div className="panel-raised relative mt-4 overflow-hidden">
        <div className="absolute inset-0 opacity-35">
          <PekoniScene scene="arena" variant={`battle-${data.id}`} className="h-full w-full" vignette={false} />
        </div>

        <div className="relative p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Eyebrow>{data.case.name}</Eyebrow>
              <h2 className="font-serif-display mt-1.5 text-2xl sm:text-3xl">
                {finished
                  ? winners.length === 1
                    ? `${winners[0].username} voitti`
                    : "Battle päättyi"
                  : status === "RUNNING"
                    ? `Kierros ${Math.max(1, data.revealedRounds)} / ${data.rounds}`
                    : "Odottaa pelaajia"}
              </h2>
              <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
                {BATTLE_MODE_META[data.mode]?.description}
              </p>
            </div>

            <div className="text-right">
              {finished ? (
                <>
                  <p className="eyebrow text-[10px]">Potti</p>
                  <Coins amount={data.prizePool ?? 0} size="lg" className="mt-1" />
                </>
              ) : status === "RUNNING" && countdown > 0 ? (
                <>
                  <p className="eyebrow text-[10px]">Alkaa</p>
                  <p className="tabular mt-1 text-2xl font-semibold text-[var(--color-violet-400)]">
                    {(countdown / 1000).toFixed(1)}s
                  </p>
                </>
              ) : (
                <>
                  <p className="eyebrow text-[10px]">Paikkoja vapaana</p>
                  <p className="tabular mt-1 text-2xl font-semibold">
                    {openSeats} / {data.slots}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------ participants */}
          <div
            className="mt-6 grid gap-3"
            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(190px, 1fr))` }}
          >
            {Array.from({ length: data.slots }).map((_, slot) => {
              const participant = data.participants.find((entry) => entry.slot === slot);

              if (!participant) {
                return (
                  <div
                    key={`empty-${slot}`}
                    className="flex min-h-[260px] flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--line)] p-4 text-center"
                  >
                    <Icon name="user" size={22} className="text-[var(--text-faint)]" />
                    <p className="mt-3 text-[13px] text-[var(--text-muted)]">Vapaa paikka</p>
                    {!alreadyIn && status === "WAITING" && (
                      <button
                        type="button"
                        onClick={join}
                        disabled={joining}
                        className="btn btn-primary btn-sm mt-4"
                      >
                        {joining ? "Liitytään…" : "Liity"}
                      </button>
                    )}
                  </div>
                );
              }

              const draws = byParticipant.get(participant.id) ?? [];
              const isMe = participant.userId === player?.id;
              const won = participant.isWinner === true;

              return (
                <div
                  key={participant.id}
                  className="relative overflow-hidden rounded-[var(--radius-card)] border p-4"
                  style={{
                    borderColor: won
                      ? "color-mix(in oklab, var(--color-amber-500) 40%, transparent)"
                      : isMe
                        ? "color-mix(in oklab, var(--color-emerald-500) 34%, transparent)"
                        : "var(--line-soft)",
                    background: won
                      ? "linear-gradient(180deg, color-mix(in oklab, var(--color-amber-500) 9%, transparent), transparent)"
                      : "color-mix(in oklab, var(--color-obsidian-900) 62%, transparent)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      username={participant.username}
                      minecraftUsername={participant.minecraftUsername}
                      size={36}
                      ring={won || isMe}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">
                        {participant.username}
                        {isMe && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-emerald-400)]">
                            sinä
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--text-faint)]">
                        {participant.isBot ? "Botti" : `Slot ${participant.slot + 1}`}
                        {data.mode === "TEAM" && ` · Tiimi ${participant.team + 1}`}
                      </p>
                    </div>
                    {won && <Icon name="crown" size={18} className="text-[var(--color-amber-400)]" />}
                  </div>

                  <div className="mt-3.5 space-y-1.5">
                    {Array.from({ length: data.rounds }).map((__, roundIndex) => {
                      const draw = draws.find((entry) => entry.roundNumber === roundIndex + 1);
                      if (!draw) {
                        return (
                          <div
                            key={roundIndex}
                            className="flex h-[38px] items-center justify-center rounded-[8px] border border-dashed border-[var(--line-soft)] text-[11px] text-[var(--text-faint)]"
                          >
                            {roundIndex + 1}
                          </div>
                        );
                      }
                      const meta = RARITY_META[draw.item.rarity as Rarity];
                      return (
                        <div
                          key={roundIndex}
                          className="rise flex h-[38px] items-center gap-2 rounded-[8px] px-2"
                          style={{
                            background: `color-mix(in oklab, ${meta.color} 10%, transparent)`,
                            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 22%, transparent)`,
                          }}
                        >
                          <span style={{ color: meta.color }}>
                            <Icon name={draw.item.icon} size={15} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-dim)]">
                            {draw.item.name}
                          </span>
                          <span className="tabular text-[11px] font-semibold" style={{ color: meta.color }}>
                            {formatCoins(draw.item.value)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3.5 border-t border-[var(--line-soft)] pt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                        Yhteensä
                      </span>
                      <span className="tabular text-[15px] font-semibold">
                        {formatCoins(participant.total)}
                      </span>
                    </div>
                    {finished && participant.payout !== null && (
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                          Voitto
                        </span>
                        <Coins amount={participant.payout} size="sm" showMark={false} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {finished && (
            <div className="rise mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--color-amber-500)_26%,transparent)] bg-[color-mix(in_oklab,var(--color-amber-500)_6%,transparent)] px-5 py-4">
              <div className="flex items-center gap-3">
                <Icon name="laurel" size={22} className="text-[var(--color-amber-400)]" />
                <div>
                  <p className="text-[15px] font-semibold">
                    {winners.length === 0
                      ? "Battle peruuntui"
                      : winners.length === 1
                        ? `${winners[0].username} vie potin`
                        : `${winners.map((entry) => entry.username).join(" & ")} vievät potin`}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                    {data.case.name} · {data.rounds} kierrosta · {data.participants.length} pelaajaa
                  </p>
                </div>
              </div>
              <button type="button" onClick={onExit} className="btn btn-ghost btn-sm">
                Takaisin aulaan
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Milliseconds until the shared start clock, ticking at animation rate. */
function useCountdown(startsAt: number | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!startsAt) {
      setRemaining(0);
      return;
    }
    const update = () => setRemaining(Math.max(0, startsAt - Date.now()));
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [startsAt]);

  return remaining;
}
