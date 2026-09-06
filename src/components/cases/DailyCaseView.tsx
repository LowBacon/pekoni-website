"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiPost, idempotencyKey, useResource } from "@/lib/client/api";
import { formatCoins, formatCountdown, formatRelative } from "@/lib/format";
import { RARITY_META } from "@/lib/enums";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import { Icon } from "@/components/ui/Icons";
import {
  Coins,
  ErrorState,
  Eyebrow,
  Pill,
  RarityChip,
  SectionHeader,
  Skeleton,
  StatCard,
  VirtualCurrencyNote,
} from "@/components/ui/primitives";
import { useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import CaseReel, { type ReelItem } from "./CaseReel";

type Status = {
  available: boolean;
  nextAvailableAt: string | null;
  streak: number;
  lastClaimedAt: string | null;
  totalClaimed: number;
};

type ClaimResult = {
  balance: number;
  item: ReelItem;
  amount: number;
  streak: number;
  reel: ReelItem[];
  winningIndex: number;
  nextAvailableAt: string;
  level: number;
  leveledUp: boolean;
  unlocked: { title: string; description: string; coinReward: number }[];
};

type Phase = "closed" | "opening" | "spinning" | "revealed";

const REWARD_TIERS = [
  { label: "50–250 coins", detail: "Tavallinen huoltoarkku", tone: "neutral" as const },
  { label: "500–1 000 coins", detail: "Hyvä päivä", tone: "emerald" as const },
  { label: "Harvinaiset esineet", detail: "Riimut ja reliikit", tone: "violet" as const },
  { label: "Jackpot", detail: "Harvinaisin löytö", tone: "amber" as const },
];

export default function DailyCaseView() {
  const { data, error, loading, reload, setData } = useResource<Status>("/api/daily");
  const [phase, setPhase] = useState<Phase>("closed");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [pending, setPending] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const settle = useSettleResponse();
  const { sound } = usePreferences();
  const toast = useToast();

  // Countdown ticks locally; the server still decides whether a claim is allowed.
  useEffect(() => {
    const next = result?.nextAvailableAt ?? data?.nextAvailableAt;
    if (!next) {
      setRemaining(0);
      return;
    }
    const target = new Date(next).getTime();
    const update = () => setRemaining(Math.max(0, target - Date.now()));
    update();
    const timer = setInterval(update, 1_000);
    return () => clearInterval(timer);
  }, [data?.nextAvailableAt, result?.nextAvailableAt]);

  const claim = useCallback(async () => {
    if (pending) return;
    setPending(true);
    setPhase("opening");
    sound("caseOpen");

    try {
      const response = await apiPost<ClaimResult>("/api/daily", {
        idempotencyKey: idempotencyKey(),
      });
      setResult(response);
      settle(response);
      // A beat of chest-unlock before the strip starts moving.
      setTimeout(() => setPhase("spinning"), 620);
    } catch (cause) {
      sound("error");
      toast.error(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
      setPhase("closed");
      setPending(false);
      reload();
    }
  }, [pending, sound, settle, toast, reload]);

  const onSettled = useCallback(() => {
    setPending(false);
    setPhase("revealed");
    if (!result) return;

    const meta = RARITY_META[result.item.rarity];
    if (meta.rank >= 4) {
      sound("rare");
      toast.reward(result.item.name, `${meta.label} · +${formatCoins(result.amount)} coins`);
    } else {
      sound("win");
      toast.success(`+${formatCoins(result.amount)} coins`, "Daily Case avattu");
    }

    setData((current) =>
      current
        ? {
            ...current,
            available: false,
            nextAvailableAt: result.nextAvailableAt,
            streak: result.streak,
            totalClaimed: current.totalClaimed + 1,
            lastClaimedAt: new Date().toISOString(),
          }
        : current,
    );
  }, [result, sound, toast, setData]);

  const available = data?.available ?? false;

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="clearing" variant="daily" className="h-full w-full" intensity={0.95} />
        <Atmosphere scene="clearing" density={0.7} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 78%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[980px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise max-w-2xl">
          <Eyebrow>Metsäaukion huoltoarkku</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.4rem,7vw,4rem)] leading-[0.95] tracking-[-0.03em]">
            Daily Case
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)]">
            Avaa ilmainen palkinto kerran päivässä.
          </p>
        </section>

        {error && !data ? (
          <ErrorState className="mt-8" onRetry={reload} />
        ) : loading && !data ? (
          <Skeleton className="mt-8 h-[420px] rounded-[var(--radius-panel)]" />
        ) : (
          <>
            <section className="panel-raised rise relative mt-8 overflow-hidden">
              <div className="absolute inset-0 opacity-45">
                <PekoniScene
                  scene="clearing"
                  variant="daily-chest"
                  className="h-full w-full"
                  vignette={false}
                />
              </div>

              <div className="relative p-6 sm:p-8">
                {/* -------------------------------------------------- the chest */}
                {phase === "closed" || phase === "opening" ? (
                  <div className="flex flex-col items-center py-6 text-center">
                    <div
                      className={`relative flex size-[132px] items-center justify-center rounded-[22px] transition-transform duration-500 ${
                        phase === "opening" ? "scale-110" : ""
                      }`}
                      style={{
                        background:
                          "linear-gradient(180deg, color-mix(in oklab, var(--color-amber-500) 16%, transparent), var(--color-obsidian-850))",
                        boxShadow: available
                          ? "inset 0 0 0 1px color-mix(in oklab, var(--color-amber-500) 34%, transparent), 0 0 60px color-mix(in oklab, var(--color-amber-500) 18%, transparent)"
                          : "inset 0 0 0 1px var(--line)",
                      }}
                    >
                      <Icon
                        name="chest"
                        size={64}
                        className={
                          available ? "text-[var(--color-amber-400)]" : "text-[var(--text-faint)]"
                        }
                      />
                      {available && phase === "closed" && (
                        <span
                          className="absolute inset-0 rounded-[22px] animate-pulse"
                          style={{
                            boxShadow:
                              "0 0 0 1px color-mix(in oklab, var(--color-amber-400) 30%, transparent)",
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    {available ? (
                      <>
                        <p className="mt-6 text-[15px] text-[var(--text-dim)]">
                          Arkku on täynnä. Se odottaa avaajaansa.
                        </p>
                        <button
                          type="button"
                          onClick={claim}
                          disabled={pending}
                          className="btn btn-amber btn-lg mt-5"
                        >
                          {pending ? "Avataan…" : "Avaa Daily Case"}
                          {!pending && <Icon name="arrowRight" size={16} className="btn-nudge" />}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mt-6 text-[13px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
                          Seuraava arkku
                        </p>
                        <p className="tabular font-serif-display mt-2 text-[clamp(2.2rem,8vw,3.4rem)] leading-none text-[var(--color-amber-400)]">
                          {formatCountdown(remaining)}
                        </p>
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                          {data?.lastClaimedAt
                            ? `Avasit arkun ${formatRelative(data.lastClaimedAt)}.`
                            : "Palaa huomenna."}
                        </p>
                        <Link href="/caser" className="btn btn-ghost btn-sm mt-5">
                          Selaa muita caseja
                          <Icon name="arrowRight" size={14} className="btn-nudge" />
                        </Link>
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    {result && (
                      <CaseReel
                        items={result.reel}
                        winningIndex={result.winningIndex}
                        spinning={phase === "spinning" || phase === "revealed"}
                        onSettled={onSettled}
                        accent="var(--color-amber-400)"
                      />
                    )}

                    {phase === "revealed" && result && (
                      <div className="rise mt-6 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span
                            className="flex size-14 items-center justify-center rounded-2xl"
                            style={{
                              color: RARITY_META[result.item.rarity].color,
                              background: `color-mix(in oklab, ${RARITY_META[result.item.rarity].color} 14%, transparent)`,
                            }}
                          >
                            <Icon name={result.item.icon} size={28} />
                          </span>
                          <div>
                            <p className="text-lg font-semibold">{result.item.name}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              <RarityChip rarity={result.item.rarity} />
                              <Coins amount={result.amount} signed size="sm" showMark={false} />
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="eyebrow text-[10px]">Seuraava</p>
                          <p className="tabular mt-1 text-lg font-semibold text-[var(--color-amber-400)]">
                            {formatCountdown(remaining)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Streak"
                value={`${result?.streak ?? data?.streak ?? 0}`}
                detail="peräkkäistä päivää"
                accent="var(--color-amber-400)"
                icon={<Icon name="fire" size={16} />}
              />
              <StatCard
                label="Avattu yhteensä"
                value={formatCoins(data?.totalClaimed ?? 0)}
                accent="var(--color-emerald-400)"
                icon={<Icon name="chest" size={16} />}
              />
              <StatCard
                label="Hinta"
                value="0"
                detail="Daily Case on aina ilmainen"
                accent="var(--color-mint-400)"
                icon={<Icon name="coin" size={16} />}
              />
            </section>

            <section className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_1fr]">
              <div className="panel p-6">
                <SectionHeader eyebrow="Palkinnot" title="Mitä arkusta voi löytyä" />
                <ul className="mt-5 space-y-2.5">
                  {REWARD_TIERS.map((tier) => (
                    <li
                      key={tier.label}
                      className="flex items-center justify-between gap-4 rounded-[10px] border border-[var(--line-soft)] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[var(--text-dim)]">
                          {tier.label}
                        </p>
                        <p className="truncate text-[11px] text-[var(--text-faint)]">{tier.detail}</p>
                      </div>
                      <Pill tone={tier.tone}>Mahdollinen</Pill>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs leading-relaxed text-[var(--text-faint)]">
                  Palkinto arvotaan palvelimella heti kun painat avausnappia — nauhan pyöriminen on
                  pelkkää animaatiota.
                </p>
              </div>

              <div className="panel relative overflow-hidden p-6">
                <div className="absolute inset-0 opacity-25">
                  <PekoniScene
                    scene="wilderness"
                    variant="daily-side"
                    className="h-full w-full"
                    vignette={false}
                  />
                </div>
                <div className="relative">
                  <Eyebrow>Streak</Eyebrow>
                  <h3 className="font-serif-display mt-2.5 text-xl">Peräkkäiset päivät</h3>
                  <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                    Arkku aukeaa 24 tunnin välein. Jos palaat kahden vuorokauden sisällä, putki
                    jatkuu — muuten se alkaa alusta.
                  </p>
                  <div className="rule my-5" />
                  <VirtualCurrencyNote />
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
