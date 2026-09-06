"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCoins, formatMultiplier } from "@/lib/format";
import {
  PAYTABLE,
  SLOT_SYMBOLS,
  type SlotSymbolKey,
  type SlotLineWin,
} from "@/lib/games/slots";
import { Coins, Eyebrow, Pill } from "@/components/ui/primitives";
import { Icon, ItemIcon } from "@/components/ui/Icons";
import { GameLayout } from "./GameShell";
import BetPanel, { useWagerGuard } from "./BetPanel";
import HistoryStrip, { type HistoryEntry } from "./HistoryStrip";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Slots — the Pekoni excavation machine.
 *
 * The reels are a projection of a grid the server already decided. The spin
 * animation walks a decorative strip and then snaps to the authoritative result.
 */

const SYMBOL_ART: Record<SlotSymbolKey, { icon: string; color: string }> = {
  coin: { icon: "coin", color: "var(--color-frost-500)" },
  apple: { icon: "apple", color: "var(--color-emerald-400)" },
  gold: { icon: "ingot", color: "var(--color-amber-400)" },
  emerald: { icon: "emerald", color: "var(--color-mint-400)" },
  diamond: { icon: "diamond", color: "var(--color-cyan-400)" },
  creeper: { icon: "skull", color: "var(--color-emerald-500)" },
  tnt: { icon: "ember", color: "var(--color-danger-400)" },
  netherite: { icon: "netherite", color: "var(--color-violet-400)" },
  rune: { icon: "rune", color: "var(--color-amber-400)" },
};

const ALL_KEYS = SLOT_SYMBOLS.map((symbol) => symbol.key);
const SPIN_UP_MS = 260;
const REEL_STAGGER_MS = 130;

type SpinResult = {
  balance: number;
  payout: number;
  profit: number;
  multiplier: number;
  result: { grid: SlotSymbolKey[][]; wins: SlotLineWin[] };
  level: number;
  leveledUp: boolean;
  unlocked: { title: string; description: string; coinReward: number }[];
};

export default function SlotsGame({ min, max }: { min: number; max: number }) {
  const [bet, setBet] = useState(50);
  const [grid, setGrid] = useState<SlotSymbolKey[][]>(() =>
    Array.from({ length: 5 }, (_, reel) =>
      Array.from({ length: 3 }, (_, row) => ALL_KEYS[(reel * 3 + row) % ALL_KEYS.length]),
    ),
  );
  const [spinningReels, setSpinningReels] = useState<boolean[]>([false, false, false, false, false]);
  const [wins, setWins] = useState<SlotLineWin[]>([]);
  const [last, setLast] = useState<SpinResult | null>(null);
  const [pending, setPending] = useState(false);
  const [auto, setAuto] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [showPaytable, setShowPaytable] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound, reducedMotion } = usePreferences();
  const toast = useToast();
  const { confirm, dialog } = useWagerGuard();

  const autoRef = useRef(auto);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  autoRef.current = auto;

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const highlighted = new Set(
    wins.flatMap((win) => win.cells.map(([reel, row]) => `${reel}-${row}`)),
  );

  const spin = useCallback(async () => {
    if (pending) return;
    if (bet > balance) {
      sound("error");
      setAuto(false);
      toast.error("Coinit eivät riitä.");
      return;
    }
    if (!(await confirm(bet, balance))) {
      setAuto(false);
      return;
    }

    setPending(true);
    setWins([]);
    sound("bet");

    const stagger = reducedMotion ? 0 : turbo ? 60 : REEL_STAGGER_MS;
    const spinUp = reducedMotion ? 0 : turbo ? 120 : SPIN_UP_MS;

    if (!reducedMotion) {
      setSpinningReels([true, true, true, true, true]);
      sound("reelSpin");
    }

    try {
      const [response] = await Promise.all([
        fetch("/api/games/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bet, idempotencyKey: crypto.randomUUID() }),
        }),
        new Promise((resolve) => {
          const timer = setTimeout(resolve, spinUp);
          timers.current.push(timer);
        }),
      ]);

      const data = await response.json();
      if (!response.ok) {
        setSpinningReels([false, false, false, false, false]);
        sound("error");
        setAuto(false);
        toast.error(data.error ?? "Jokin meni pieleen.");
        return;
      }

      const result = data as SpinResult;
      setGrid(result.result.grid);
      settle(result);

      // Reels come to rest left to right, each with its own mechanical stop.
      for (let reel = 0; reel < 5; reel += 1) {
        const timer = setTimeout(
          () => {
            setSpinningReels((current) => {
              const next = [...current];
              next[reel] = false;
              return next;
            });
            sound("reelStop");
            if (reel === 4) {
              setWins(result.result.wins);
              setLast(result);
              setHistory((current) =>
                [
                  {
                    id: `${Date.now()}-${Math.random()}`,
                    multiplier: result.multiplier,
                    won: result.payout > 0,
                    label: result.payout > 0 ? formatMultiplier(result.multiplier) : "—",
                  },
                  ...current,
                ].slice(0, 14),
              );
              if (result.profit > 0) {
                sound(result.multiplier >= 10 ? "bigWin" : "win");
                toast.success(`+${formatCoins(result.profit)} coins`);
              } else if (result.payout > 0) {
                sound("win");
              } else {
                sound("lose");
              }
              setPending(false);
              if (autoRef.current) {
                const nextTimer = setTimeout(() => void spin(), turbo ? 260 : 900);
                timers.current.push(nextTimer);
              }
            }
          },
          reducedMotion ? 0 : stagger * (reel + 1),
        );
        timers.current.push(timer);
      }

      if (reducedMotion) {
        setSpinningReels([false, false, false, false, false]);
      }
    } catch {
      setSpinningReels([false, false, false, false, false]);
      setPending(false);
      setAuto(false);
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    }
  }, [bet, balance, pending, confirm, reducedMotion, settle, sound, toast, turbo]);

  return (
    <>
      {dialog}
      <GameLayout
        surface={
          <>
            <div className="panel-raised relative overflow-hidden">
              {/* Machine housing */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(70% 50% at 50% -10%, color-mix(in oklab, var(--color-amber-500) 12%, transparent), transparent 70%)",
                }}
              />
              <svg
                viewBox="0 0 600 60"
                className="pointer-events-none absolute inset-x-0 top-0 h-12 w-full opacity-40"
                aria-hidden="true"
              >
                <path d="M0 46h600M40 46V22h24v24M120 46V14h30v32M480 46V18h26v28M556 46V26h20v20" stroke="var(--color-amber-600)" strokeWidth="1.2" fill="none" />
                <circle cx="300" cy="26" r="9" fill="none" stroke="var(--color-amber-500)" strokeWidth="1.4" />
                <circle cx="300" cy="26" r="3" fill="var(--color-amber-500)" opacity="0.6" />
              </svg>

              <div className="relative p-3 pt-14 sm:p-5 sm:pt-16">
                <div className="grid grid-cols-5 gap-1.5 rounded-[14px] border border-[var(--line-strong)] bg-[var(--color-obsidian-950)] p-2 sm:gap-2.5 sm:p-3">
                  {grid.map((column, reel) => (
                    <div key={reel} className="overflow-hidden rounded-[10px]">
                      <div
                        className={
                          spinningReels[reel]
                            ? "animate-[reelBlur_0.28s_linear_infinite] space-y-1.5 sm:space-y-2.5"
                            : "space-y-1.5 sm:space-y-2.5"
                        }
                      >
                        {column.map((symbol, row) => {
                          const art = SYMBOL_ART[symbol];
                          const isWin = highlighted.has(`${reel}-${row}`);
                          return (
                            <div
                              key={row}
                              className="relative flex aspect-square items-center justify-center rounded-[8px] border transition-all duration-300"
                              style={{
                                borderColor: isWin
                                  ? `color-mix(in oklab, ${art.color} 55%, transparent)`
                                  : "var(--line-soft)",
                                background: isWin
                                  ? `color-mix(in oklab, ${art.color} 12%, var(--color-obsidian-880))`
                                  : "var(--color-obsidian-880)",
                                boxShadow: isWin
                                  ? `0 0 20px color-mix(in oklab, ${art.color} 32%, transparent)`
                                  : "none",
                                opacity: spinningReels[reel] ? 0.55 : 1,
                              }}
                            >
                              <ItemIcon
                                name={art.icon}
                                size={30}
                                color={art.color}
                                className={isWin && !reducedMotion ? "animate-[floatY_1.4s_ease-in-out_infinite]" : ""}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex min-h-[28px] flex-wrap items-center justify-center gap-2">
                  {last && last.payout > 0 ? (
                    <>
                      <Pill tone="amber">{formatMultiplier(last.multiplier)}</Pill>
                      <Pill tone="emerald">+{formatCoins(last.profit)} coins</Pill>
                      <span className="text-[13px] text-[var(--text-muted)]">
                        {wins.length} voittolinja{wins.length === 1 ? "" : "a"}
                      </span>
                    </>
                  ) : (
                    <span className="text-[13px] text-[var(--text-faint)]">
                      {pending ? "Kone jyskyttää…" : "Kone odottaa seuraavaa panosta."}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="panel px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <Icon name="history" size={14} className="text-[var(--text-faint)]" />
                <p className="eyebrow text-[10px]">Viimeisimmät pyöräytykset</p>
              </div>
              <HistoryStrip entries={history} />
            </div>

            {showPaytable && <Paytable onClose={() => setShowPaytable(false)} />}
          </>
        }
        controls={
          <div className="panel-raised p-5">
            <BetPanel value={bet} onChange={setBet} min={min} max={max} disabled={pending}>
              <button
                type="button"
                onClick={() => void spin()}
                disabled={pending}
                className="btn btn-primary btn-lg mt-1 w-full text-base"
              >
                {pending ? "Pyörii…" : "SPIN"}
              </button>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sound("click");
                    const next = !auto;
                    setAuto(next);
                    if (next && !pending) void spin();
                  }}
                  className={`btn btn-sm ${auto ? "btn-amber" : "btn-ghost"}`}
                  aria-pressed={auto}
                >
                  <Icon name={auto ? "pause" : "refresh"} size={14} />
                  Auto Spin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound("click");
                    setTurbo((value) => !value);
                  }}
                  className={`btn btn-sm ${turbo ? "btn-amber" : "btn-ghost"}`}
                  aria-pressed={turbo}
                >
                  <Icon name="bolt" size={14} />
                  Turbo
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  sound("click");
                  setShowPaytable((value) => !value);
                }}
                className="btn btn-ghost btn-sm mt-2 w-full"
              >
                <Icon name="info" size={14} />
                {showPaytable ? "Piilota paytable" : "Paytable"}
              </button>

              <dl className="mt-4 space-y-2 border-t border-[var(--line-soft)] pt-4">
                <Row label="Voittolinjoja" value="9" />
                <Row label="Palautusprosentti" value="95,6 %" />
                <Row
                  label="Edellinen voitto"
                  value={<Coins amount={last?.payout ?? 0} size="sm" showMark={false} />}
                />
              </dl>
            </BetPanel>
          </div>
        }
      />
    </>
  );
}

function Paytable({ onClose }: { onClose: () => void }) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Eyebrow>Paytable</Eyebrow>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Kertoimet koko panoksesta, voittolinjaa kohti. Riimu korvaa kaikki symbolit.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--text)]"
          aria-label="Sulje paytable"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-left text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.1em] text-[var(--text-faint)]">
              <th className="pb-2 font-semibold">Symboli</th>
              <th className="pb-2 text-right font-semibold">3×</th>
              <th className="pb-2 text-right font-semibold">4×</th>
              <th className="pb-2 text-right font-semibold">5×</th>
            </tr>
          </thead>
          <tbody>
            {[...SLOT_SYMBOLS].reverse().map((symbol) => {
              const art = SYMBOL_ART[symbol.key];
              const pays = PAYTABLE[symbol.key];
              return (
                <tr key={symbol.key} className="border-t border-[var(--line-soft)]">
                  <td className="py-2">
                    <span className="flex items-center gap-2.5">
                      <ItemIcon name={art.icon} size={20} color={art.color} />
                      <span className="text-[var(--text-dim)]">{symbol.name}</span>
                      {symbol.key === "rune" && (
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-amber-400)]">
                          Wild
                        </span>
                      )}
                    </span>
                  </td>
                  {pays.map((value, index) => (
                    <td key={index} className="tabular py-2 text-right text-[var(--text-muted)]">
                      {value}×
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular text-[13px] font-semibold text-[var(--text-dim)]">{value}</dd>
    </div>
  );
}
