"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCoins, formatMultiplier, formatPercent } from "@/lib/format";
import { diceMultiplier, diceWinChance, type DiceDirection } from "@/lib/games/dice";
import { Coins, Eyebrow } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icons";
import { GameLayout } from "./GameShell";
import BetPanel, { useWagerGuard } from "./BetPanel";
import HistoryStrip, { type HistoryEntry } from "./HistoryStrip";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Dice — the probability altar.
 *
 * The slider only chooses a threshold. The roll itself comes from the server's
 * provably-fair stream; nothing in this component decides an outcome.
 */

type RoundResult = {
  balance: number;
  payout: number;
  profit: number;
  multiplier: number;
  outcome: string;
  result: { roll: number; won: boolean; target: number; direction: DiceDirection };
  level: number;
  leveledUp: boolean;
  unlocked: { title: string; description: string; coinReward: number }[];
};

export default function DiceGame({ min, max }: { min: number; max: number }) {
  const [bet, setBet] = useState(50);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<DiceDirection>("under");
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<RoundResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [displayRoll, setDisplayRoll] = useState<number | null>(null);

  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound, reducedMotion } = usePreferences();
  const toast = useToast();
  const { confirm, dialog } = useWagerGuard();
  const animation = useRef(0);

  const chance = diceWinChance(target, direction);
  const multiplier = diceMultiplier(target, direction);
  const potential = Math.floor(bet * multiplier) - bet;

  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  /** Spins the numeral toward the real result. Presentation only. */
  const animateTo = useCallback(
    (value: number, won: boolean) => {
      if (reducedMotion) {
        setDisplayRoll(value);
        sound(won ? "win" : "lose");
        return;
      }
      const duration = 620;
      const start = performance.now();
      cancelAnimationFrame(animation.current);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        if (t < 1) {
          setDisplayRoll(Math.random() * 100 * (1 - eased) + value * eased);
          animation.current = requestAnimationFrame(step);
        } else {
          setDisplayRoll(value);
          sound(won ? "win" : "lose");
        }
      };
      animation.current = requestAnimationFrame(step);
    },
    [reducedMotion, sound],
  );

  const roll = async () => {
    if (pending) return;
    if (bet > balance) {
      sound("error");
      toast.error("Coinit eivät riitä.");
      return;
    }
    if (!(await confirm(bet, balance))) return;

    setPending(true);
    sound("bet");

    try {
      const response = await fetch("/api/games/dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bet, target, direction, idempotencyKey: crypto.randomUUID() }),
      });
      const data = await response.json();

      if (!response.ok) {
        sound("error");
        toast.error(data.error ?? "Jokin meni pieleen.");
        return;
      }

      const result = data as RoundResult;
      setLast(result);
      settle(result);
      animateTo(result.result.roll, result.result.won);
      setHistory((current) =>
        [
          {
            id: `${Date.now()}-${Math.random()}`,
            multiplier: result.multiplier,
            won: result.result.won,
            label: result.result.roll.toFixed(2),
          },
          ...current,
        ].slice(0, 14),
      );
      if (result.profit > 0) toast.success(`+${formatCoins(result.profit)} coins`);
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setPending(false);
    }
  };

  const won = last?.result.won ?? null;
  const shown = displayRoll ?? 50;

  return (
    <>
      {dialog}
      <GameLayout
        surface={
          <>
            <div className="panel-raised relative overflow-hidden">
              <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-700"
                style={{
                  opacity: won === null || pending ? 0 : 1,
                  background:
                    won === true
                      ? "radial-gradient(70% 60% at 50% 42%, color-mix(in oklab, var(--color-emerald-500) 20%, transparent), transparent 70%)"
                      : "radial-gradient(70% 60% at 50% 42%, color-mix(in oklab, var(--color-danger-500) 13%, transparent), transparent 70%)",
                }}
              />
              {/* Altar geometry — carved rings behind the numeral */}
              <svg
                viewBox="0 0 400 200"
                className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]"
                aria-hidden="true"
              >
                <circle cx="200" cy="100" r="86" fill="none" stroke="var(--color-violet-400)" strokeWidth="0.6" />
                <circle cx="200" cy="100" r="66" fill="none" stroke="var(--color-violet-400)" strokeWidth="0.4" strokeDasharray="3 6" />
                <circle cx="200" cy="100" r="104" fill="none" stroke="var(--color-violet-400)" strokeWidth="0.3" />
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i / 12) * Math.PI * 2;
                  return (
                    <rect
                      key={i}
                      x={200 + Math.cos(angle) * 96 - 3}
                      y={100 + Math.sin(angle) * 96 - 3}
                      width="6"
                      height="6"
                      fill="var(--color-violet-400)"
                      transform={`rotate(${(i / 12) * 360} ${200 + Math.cos(angle) * 96} ${100 + Math.sin(angle) * 96})`}
                    />
                  );
                })}
              </svg>

              <div className="relative px-5 py-10 sm:px-8 sm:py-14">
                <div className="text-center">
                  <Eyebrow>
                    {direction === "under" ? "Roll Under" : "Roll Over"} {target}
                  </Eyebrow>
                  <p
                    className="tabular font-serif-display mt-3 text-[clamp(4rem,15vw,7.5rem)] leading-none transition-colors duration-500"
                    style={{
                      color:
                        won === null
                          ? "var(--text)"
                          : won
                            ? "var(--color-emerald-300)"
                            : "var(--color-danger-400)",
                      textShadow:
                        won === true
                          ? "0 0 60px color-mix(in oklab, var(--color-emerald-500) 45%, transparent)"
                          : "none",
                    }}
                    aria-live="polite"
                    aria-label={`Heiton tulos ${shown.toFixed(2)}`}
                  >
                    {shown.toFixed(2)}
                  </p>
                  <p className="mt-2 min-h-[20px] text-sm font-medium text-[var(--text-muted)]">
                    {last ? (
                      won ? (
                        <span className="text-[var(--color-emerald-400)]">
                          Voitto {formatMultiplier(last.multiplier)} · +{formatCoins(last.profit)} coins
                        </span>
                      ) : (
                        <span>Ei osumaa tällä kertaa.</span>
                      )
                    ) : (
                      <span className="text-[var(--text-faint)]">Aseta raja ja heitä.</span>
                    )}
                  </p>
                </div>

                <div className="mx-auto mt-11 max-w-2xl">
                  <div className="relative">
                    <div className="relative h-2.5 rounded-full bg-[var(--color-obsidian-900)]">
                      <div
                        className="absolute inset-y-0 rounded-full transition-all duration-300 ease-[var(--ease-decel)]"
                        style={{
                          left: direction === "under" ? 0 : `${target}%`,
                          right: direction === "under" ? `${100 - target}%` : 0,
                          background:
                            "linear-gradient(90deg, color-mix(in oklab, var(--color-emerald-500) 50%, transparent), var(--color-emerald-400))",
                        }}
                      />
                      {displayRoll !== null && (
                        <span
                          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                          style={{
                            left: `${Math.min(100, Math.max(0, shown))}%`,
                            background: "var(--color-obsidian-950)",
                            borderColor: won ? "var(--color-emerald-300)" : "var(--color-danger-400)",
                            boxShadow: `0 0 16px ${won ? "var(--color-emerald-500)" : "var(--color-danger-500)"}`,
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </div>

                    <input
                      type="range"
                      min={2}
                      max={98}
                      step={0.5}
                      value={target}
                      disabled={pending}
                      onChange={(event) => setTarget(Number(event.target.value))}
                      className="absolute inset-x-0 -top-3 h-8 w-full cursor-pointer opacity-0"
                      aria-label="Raja-arvo"
                    />
                    <span
                      className="pointer-events-none absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-emerald-400)] bg-[var(--color-obsidian-850)] shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
                      style={{ left: `${target}%` }}
                      aria-hidden="true"
                    />
                  </div>

                  <div className="tabular mt-3 flex justify-between text-[11px] text-[var(--text-faint)]">
                    <span>0</span>
                    <span>25</span>
                    <span>50</span>
                    <span>75</span>
                    <span>100</span>
                  </div>
                </div>

                <div className="mt-8 flex justify-center">
                  <div className="segment">
                    {(["under", "over"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        disabled={pending}
                        data-active={direction === option}
                        onClick={() => {
                          sound("click");
                          setDirection(option);
                        }}
                        className="segment-item"
                      >
                        {option === "under" ? "Roll Under" : "Roll Over"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Readout label="Kerroin" value={formatMultiplier(multiplier)} accent="var(--color-emerald-400)" />
              <Readout label="Voittomahdollisuus" value={formatPercent(chance)} accent="var(--color-cyan-400)" />
              <Readout
                label="Mahdollinen voitto"
                value={`+${formatCoins(potential)}`}
                accent="var(--color-amber-400)"
              />
            </div>

            <div className="panel px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <Icon name="history" size={14} className="text-[var(--text-faint)]" />
                <p className="eyebrow text-[10px]">Viimeisimmät heitot</p>
              </div>
              <HistoryStrip entries={history} />
            </div>
          </>
        }
        controls={
          <div className="panel-raised p-5">
            <BetPanel value={bet} onChange={setBet} min={min} max={max} disabled={pending}>
              <button
                type="button"
                onClick={roll}
                disabled={pending}
                className="btn btn-primary btn-lg mt-1 w-full"
              >
                {pending ? "Heitetään…" : "Heitä"}
              </button>
              <dl className="mt-4 space-y-2 border-t border-[var(--line-soft)] pt-4">
                <Row label="Kerroin" value={formatMultiplier(multiplier)} />
                <Row label="Voittomahdollisuus" value={formatPercent(chance, 2)} />
                <Row
                  label="Mahdollinen voitto"
                  value={<Coins amount={potential} size="sm" showMark={false} />}
                />
              </dl>
            </BetPanel>
          </div>
        }
      />
    </>
  );
}

function Readout({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="panel px-4 py-3">
      <p className="eyebrow text-[10px]">{label}</p>
      <p className="tabular mt-1.5 text-lg font-semibold" style={{ color: accent }}>
        {value}
      </p>
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
