"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { apiPost, idempotencyKey, useResource } from "@/lib/client/api";
import { formatCoins } from "@/lib/format";
import { LARGE_WAGER_RATIO } from "@/lib/games/config";
import { RARITY_META, type Rarity } from "@/lib/enums";
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
  VirtualCurrencyNote,
} from "@/components/ui/primitives";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import CaseCard, { caseScene, type CaseSummary } from "./CaseCard";
import CaseReel, { type ReelItem } from "./CaseReel";

type OpenResult = {
  balance: number;
  item: ReelItem;
  cost: number;
  profit: number;
  openingId: string;
  reel: ReelItem[];
  winningIndex: number;
  level: number;
  leveledUp: boolean;
  unlocked: { title: string; description: string; coinReward: number }[];
};

type BatchResult = {
  opens: OpenResult[];
  balance: number;
  count: number;
  totalCost: number;
  totalValue: number;
  totalProfit: number;
};

type Phase = "idle" | "spinning" | "revealed";

/** How many cases one action opens. The server caps this independently. */
const COUNTS = [1, 3] as const;

export default function CaserView() {
  const { data, error, loading, reload } = useResource<{ cases: CaseSummary[] }>("/api/cases");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [batch, setBatch] = useState<BatchResult | null>(null);
  const [count, setCount] = useState<number>(1);
  /*
    How many reels have stopped.

    A ref, not state: nothing renders from this number, and using state would
    re-render the whole vault each time one of three reels lands — for a value
    only the completion check ever reads.
  */
  const settledReels = useRef(0);
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<{ id: string; item: ReelItem; profit: number }[]>([]);

  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound } = usePreferences();
  const toast = useToast();

  const cases = data?.cases ?? [];
  const selected = useMemo(
    () => cases.find((entry) => entry.id === selectedId) ?? null,
    [cases, selectedId],
  );

  const open = useCallback(async () => {
    if (!selected || pending) return;

    // The full batch price, so a 3x that cannot be afforded is refused here
    // rather than after the server has already said no.
    const cost = selected.price * count;

    if (cost > balance) {
      sound("error");
      toast.error(
        "Coinit eivät riitä.",
        `${count}× ${selected.name} maksaa ${formatCoins(cost)} coins.`,
      );
      return;
    }

    if (balance > 0 && cost / balance > LARGE_WAGER_RATIO) {
      const share = Math.round((cost / balance) * 100);
      if (!window.confirm(`Panostat ${share} % saldostasi. Jatketaanko?`)) return;
    }

    setPending(true);
    setBatch(null);
    settledReels.current = 0;
    setPhase("idle");
    sound("caseOpen");

    try {
      const response = await apiPost<BatchResult>("/api/cases/open", {
        caseId: selected.id,
        count,
        idempotencyKey: idempotencyKey(),
      });
      setBatch(response);
      setPhase("spinning");
      // Progression is identical across the batch; settling once is correct.
      settle(response.opens[response.opens.length - 1]);
    } catch (cause) {
      sound("error");
      toast.error(cause instanceof Error ? cause.message : "Jokin meni pieleen.");
      setPending(false);
    }
  }, [selected, pending, balance, count, sound, toast, settle]);

  /*
    Fired once per reel as it stops.

    With three reels the celebration must wait for the last one — announcing a
    Mythic while two reels are still spinning spoils the reveal it belongs to.
    The batch is summarised only when every reel has settled.
  */
  const onSettled = useCallback(() => {
    settledReels.current += 1;
    if (!batch || settledReels.current < batch.count) return;

    setPending(false);
    setPhase("revealed");

    const best = batch.opens.reduce((a, b) => (b.profit > a.profit ? b : a));
    const meta = RARITY_META[best.item.rarity];

    if (meta.rank >= 4) {
      sound("rare");
      toast.reward(best.item.name, `${meta.label} · ${formatCoins(best.item.value)} coins`);
    } else if (batch.totalProfit > 0) {
      sound("win");
      toast.success(`+${formatCoins(batch.totalProfit)} coins`, best.item.name);
    } else {
      // A batch that cost more than it returned is a loss, whatever the rarest
      // item in it was.
      sound("lose");
    }

    setHistory((current) =>
      [
        ...batch.opens.map((open) => ({
          id: open.openingId,
          item: open.item,
          profit: open.profit,
        })),
        ...current,
      ].slice(0, 12),
    );
  }, [batch, sound, toast]);

  return (
    <div className="relative isolate">
      <div className="env">
        <PekoniScene scene="vault" variant="caser" className="h-full w-full" intensity={0.9} />
        <Atmosphere scene="vault" density={0.6} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 80%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section className="rise max-w-2xl">
          <Eyebrow>Explorer’s vault</Eyebrow>
          <h1 className="font-serif-display mt-3 text-[clamp(2.4rem,7vw,4.2rem)] leading-[0.94] tracking-[-0.03em]">
            Cases
          </h1>
          <p className="text-pretty mt-4 text-[15px] leading-relaxed text-[var(--text-dim)]">
            Kahdeksan arkkua Pekonin eri kolkista. Sisältö arvotaan palvelimella ennen kuin ruutu
            liikahtaakaan — pudotustodennäköisyydet näkyvät jokaisen arkun kohdalla.
          </p>
        </section>

        {error && !data ? (
          <ErrorState className="mt-8" onRetry={reload} />
        ) : loading && !data ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[268px] rounded-[var(--radius-panel)]" />
            ))}
          </div>
        ) : (
          <>
            {/* ------------------------------------------------ opening stage */}
            {selected && (
              <section className="panel-raised rise mt-8 relative overflow-hidden">
                <div className="absolute inset-0 opacity-35">
                  <PekoniScene
                    scene={caseScene(selected.theme).scene}
                    variant={`stage-${selected.slug}`}
                    className="h-full w-full"
                    vignette={false}
                  />
                </div>

                <div className="relative p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Eyebrow>{selected.kind === "DAILY" ? "Daily" : "Avattavana"}</Eyebrow>
                      <h2 className="font-serif-display mt-1.5 text-2xl sm:text-3xl">{selected.name}</h2>
                      <p className="text-pretty mt-2 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">
                        {selected.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(null);
                        setBatch(null);
                        settledReels.current = 0;
                        setPhase("idle");
                      }}
                      className="btn btn-ghost btn-sm shrink-0"
                      aria-label="Sulje case"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  </div>

                  <div className="mt-6">
                    {batch ? (
                      /*
                        One reel per case. They run together rather than in
                        sequence — three consecutive six-second spins is a
                        twenty-second wait, and the whole point of opening three
                        at once is that it is faster than opening three.
                      */
                      <div className="mb-stack space-y-3">
                        {batch.opens.map((open, index) => (
                          <CaseReel
                            key={open.openingId}
                            items={open.reel}
                            winningIndex={open.winningIndex}
                            spinning={phase !== "idle"}
                            onSettled={onSettled}
                            accent={caseScene(selected.theme).glow}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-[144px] items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--line)] text-center">
                        <div>
                          <Icon
                            name="chest"
                            size={30}
                            className="mx-auto text-[var(--color-amber-400)]"
                          />
                          <p className="mt-2.5 text-sm text-[var(--text-muted)]">
                            Arkku on suljettu. Avaa se, niin sisältö paljastuu.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* How many to open. Disabled mid-spin so the price on
                          the button always matches what was actually charged. */}
                      <div className="segment" role="group" aria-label="Avattavien määrä">
                        {COUNTS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            className="segment-item"
                            data-active={count === option}
                            aria-pressed={count === option}
                            disabled={pending}
                            onClick={() => {
                              sound("click");
                              setCount(option);
                            }}
                          >
                            {option}×
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={open}
                        disabled={pending}
                        className="btn btn-primary btn-lg"
                      >
                        {pending
                          ? "Avataan…"
                          : `Avaa ${count}× · ${formatCoins(selected.price * count)}`}
                        {!pending && <Icon name="arrowRight" size={16} className="btn-nudge" />}
                      </button>
                    </div>

                    <p className="tabular text-[11px] text-[var(--text-faint)]">
                      Odotusarvo {formatCoins(selected.expectedValue)} · avattu{" "}
                      {formatCoins(selected.opened)} kertaa
                    </p>
                  </div>

                  {/* Batch summary. Stated in net terms: a rare item inside a
                      batch that still lost money is not a win. */}
                  {phase === "revealed" && batch && (
                    <div className="rise mt-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--color-obsidian-900)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="eyebrow">
                          {batch.count}× avattu · {formatCoins(batch.totalCost)} käytetty
                        </p>
                        <p
                          className={`tabular text-[15px] font-bold ${
                            batch.totalProfit > 0
                              ? "text-[var(--color-emerald-400)]"
                              : batch.totalProfit < 0
                                ? "text-[var(--color-danger-400)]"
                                : "text-[var(--text-dim)]"
                          }`}
                        >
                          {batch.totalProfit > 0 ? "+" : ""}
                          {formatCoins(batch.totalProfit)}
                        </p>
                      </div>

                      <ul className="mt-3 flex flex-wrap gap-2">
                        {batch.opens.map((open) => (
                          <li
                            key={open.openingId}
                            className={`mb-reveal flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 ${
                              RARITY_META[open.item.rarity].rank >= 4 ? "mb-halo" : ""
                            }`}
                            style={{
                              borderColor: `color-mix(in oklab, ${RARITY_META[open.item.rarity].color} 34%, transparent)`,
                              background: `color-mix(in oklab, ${RARITY_META[open.item.rarity].color} 8%, transparent)`,
                              ["--halo" as string]: RARITY_META[open.item.rarity].color,
                            }}
                          >
                            <Icon
                              name={open.item.icon}
                              size={16}
                              style={{ color: RARITY_META[open.item.rarity].color }}
                            />
                            <span className="text-[12px] font-semibold">{open.item.name}</span>
                            <Coins amount={open.profit} signed size="sm" showMark={false} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* item table */}
                  <div className="mt-7">
                    <Eyebrow>Sisältö ja todennäköisyydet</Eyebrow>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {selected.items.map((item) => {
                        const meta = RARITY_META[item.rarity as Rarity];
                        return (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-[10px] border border-[var(--line-soft)] px-3 py-2"
                          >
                            <span
                              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                              style={{
                                color: meta.color,
                                background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
                              }}
                            >
                              <Icon name={item.icon} size={16} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-[var(--text-dim)]">
                                {item.name}
                              </p>
                              <p className="tabular text-[11px]" style={{ color: meta.color }}>
                                {formatCoins(item.value)} coins
                              </p>
                            </div>
                            <span className="tabular shrink-0 text-[12px] font-semibold text-[var(--text-muted)]">
                              {(item.chance * 100).toFixed(item.chance < 0.01 ? 3 : 1)} %
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* ------------------------------------------------------- catalogue */}
            <section className="mt-10">
              <SectionHeader
                eyebrow="Katalogi"
                title="Kahdeksan arkkua"
                description="Hinta nousee, ja niin nousee myös se, mitä pohjalta voi löytyä."
              />
              <div className="stagger mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cases.map((entry) => (
                  <CaseCard
                    key={entry.id}
                    entry={entry}
                    selected={entry.id === selectedId}
                    onSelect={() => {
                      sound("click");
                      setSelectedId(entry.id);
                      setBatch(null);
                      settledReels.current = 0;
                      setPhase("idle");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="mt-12 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
              <div className="panel p-6">
                <SectionHeader eyebrow="Tämä istunto" title="Avatut arkut" />
                {history.length === 0 ? (
                  <p className="mt-5 text-sm text-[var(--text-muted)]">
                    Et ole avannut arkkua tällä istunnolla. Koko historiasi löytyy profiilista.
                  </p>
                ) : (
                  <ul className="mt-5 space-y-1">
                    {history.map((entry) => {
                      const meta = RARITY_META[entry.item.rarity];
                      return (
                        <li
                          key={entry.id}
                          className="flex items-center gap-3 rounded-[10px] px-2 py-2"
                        >
                          <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              color: meta.color,
                              background: `color-mix(in oklab, ${meta.color} 12%, transparent)`,
                            }}
                          >
                            <Icon name={entry.item.icon} size={16} />
                          </span>
                          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-dim)]">
                            {entry.item.name}
                          </p>
                          <Coins amount={entry.profit} signed size="sm" showMark={false} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="panel p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="emerald">Virtuaalivaluutta</Pill>
                  <Pill tone="cyan">Todennettavasti reilu</Pill>
                </div>
                <h3 className="font-serif-display mt-4 text-xl">Miten arpa ratkeaa</h3>
                <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-muted)]">
                  Palvelin arpoo esineen siemenestä, jonka tiiviste on julkaistu etukäteen. Ruudulla
                  pyörivä nauha on pelkkä animaatio: voittaja on päätetty ennen kuin se lähtee
                  liikkeelle.
                </p>
                <div className="rule my-5" />
                <VirtualCurrencyNote />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
