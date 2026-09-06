"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCoins, formatMultiplier } from "@/lib/format";
import { minesMultiplier, MINES_TILES } from "@/lib/games/mines";
import { Coins, Eyebrow, Pill } from "@/components/ui/primitives";
import { Icon, ItemIcon } from "@/components/ui/Icons";
import { GameLayout } from "./GameShell";
import BetPanel, { useWagerGuard } from "./BetPanel";
import HistoryStrip, { type HistoryEntry } from "./HistoryStrip";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Mines — the crystal cavern.
 *
 * Each tile is one server round-trip; the board only ever knows what has already
 * been dug. The bomb layout arrives in the response that ends the round.
 */

type TileState = "hidden" | "safe" | "mine" | "revealedMine";

const TREASURES = ["diamond", "mint", "crystal", "gem", "lapis", "amber"];

export default function MinesGame({ min, max }: { min: number; max: number }) {
  const [bet, setBet] = useState(50);
  const [mineCount, setMineCount] = useState(3);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tiles, setTiles] = useState<TileState[]>(() => Array(MINES_TILES).fill("hidden"));
  const [revealed, setRevealed] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [restored, setRestored] = useState(false);

  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound } = usePreferences();
  const toast = useToast();
  const { confirm, dialog } = useWagerGuard();

  const active = sessionId !== null;
  const picks = revealed.length;
  const multiplier = active && picks > 0 ? minesMultiplier(mineCount, picks) : 0;
  const nextMultiplier = minesMultiplier(mineCount, picks + 1);
  const profit = picks > 0 ? Math.floor(bet * multiplier) - bet : 0;

  /** A refresh mid-round must not lose the player's stake. */
  useEffect(() => {
    let cancelled = false;
    const resume = async () => {
      try {
        const response = await fetch("/api/games/mines", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          session: null | {
            sessionId: string;
            bet: number;
            mineCount: number;
            revealed: number[];
          };
        };
        if (cancelled || !data.session) return;
        setSessionId(data.session.sessionId);
        setBet(data.session.bet);
        setMineCount(data.session.mineCount);
        setRevealed(data.session.revealed);
        setTiles(() => {
          const next: TileState[] = Array(MINES_TILES).fill("hidden");
          for (const tile of data.session!.revealed) next[tile] = "safe";
          return next;
        });
        setRestored(true);
      } catch {
        /* nothing to resume */
      }
    };
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = useCallback(() => {
    setSessionId(null);
    setRevealed([]);
    setTiles(Array(MINES_TILES).fill("hidden"));
    setRestored(false);
  }, []);

  const start = async () => {
    if (busy || active) return;
    if (bet > balance) {
      sound("error");
      toast.error("Coinit eivät riitä.");
      return;
    }
    if (!(await confirm(bet, balance))) return;

    setBusy(true);
    sound("bet");
    try {
      const response = await fetch("/api/games/mines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", bet, mines: mineCount }),
      });
      const data = await response.json();
      if (!response.ok) {
        sound("error");
        toast.error(data.error ?? "Jokin meni pieleen.");
        return;
      }
      setSessionId(data.sessionId);
      setRevealed([]);
      setTiles(Array(MINES_TILES).fill("hidden"));
      settle({ balance: data.balance });
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setBusy(false);
    }
  };

  const dig = async (index: number) => {
    if (!sessionId || busy || tiles[index] !== "hidden") return;
    setBusy(true);

    try {
      const response = await fetch("/api/games/mines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", sessionId, tile: index }),
      });
      const data = await response.json();
      if (!response.ok) {
        sound("error");
        toast.error(data.error ?? "Jokin meni pieleen.");
        return;
      }

      if (data.outcome === "SAFE") {
        sound("tileSafe");
        setTiles((current) => {
          const next = [...current];
          next[index] = "safe";
          return next;
        });
        setRevealed(data.revealed);
        if (data.allClear) {
          toast.success("Koko kaivos tyhjennetty!", "Lunasta voittosi.");
        }
        return;
      }

      // Busted — the board opens up.
      sound("explosion");
      setTiles(() => {
        const next: TileState[] = Array(MINES_TILES).fill("hidden");
        for (const tile of data.revealed as number[]) next[tile] = "safe";
        for (const mine of data.mines as number[]) next[mine] = "revealedMine";
        next[index] = "mine";
        return next;
      });
      settle(data);
      setHistory((current) =>
        [{ id: `${Date.now()}`, multiplier: 0, won: false, label: "Miina" }, ...current].slice(0, 14),
      );
      toast.error("Miina!", `Menetit ${formatCoins(bet)} coins.`);
      setTimeout(reset, 2_200);
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setBusy(false);
    }
  };

  const cashout = async () => {
    if (!sessionId || busy || picks === 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/games/mines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashout", sessionId }),
      });
      const data = await response.json();
      if (!response.ok) {
        sound("error");
        toast.error(data.error ?? "Jokin meni pieleen.");
        return;
      }

      sound(data.multiplier >= 5 ? "bigWin" : "cashout");
      setTiles((current) => {
        const next = [...current];
        for (const mine of data.mines as number[]) {
          if (next[mine] === "hidden") next[mine] = "revealedMine";
        }
        return next;
      });
      settle(data);
      setHistory((current) =>
        [
          { id: `${Date.now()}`, multiplier: data.multiplier, won: true },
          ...current,
        ].slice(0, 14),
      );
      toast.success(`+${formatCoins(data.profit)} coins`, formatMultiplier(data.multiplier));
      setTimeout(reset, 1_800);
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {dialog}
      <GameLayout
        surface={
          <>
            {restored && active && (
              <div className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-cyan-500)_28%,transparent)] bg-[color-mix(in_oklab,var(--color-cyan-500)_7%,transparent)] px-4 py-3">
                <Icon name="info" size={16} className="shrink-0 text-[var(--color-cyan-400)]" />
                <p className="text-[13px] text-[var(--text-dim)]">
                  Kesken jäänyt kaivos palautettiin. Jatka kaivamista tai lunasta.
                </p>
              </div>
            )}

            <div className="panel-raised relative overflow-hidden p-4 sm:p-6">
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  background:
                    "radial-gradient(80% 60% at 50% 0%, color-mix(in oklab, var(--color-mint-500) 8%, transparent), transparent 70%)",
                }}
              />

              <div className="relative mx-auto grid max-w-[520px] grid-cols-5 gap-1.5 sm:gap-2.5">
                {tiles.map((state, index) => (
                  <MineTile
                    key={index}
                    index={index}
                    state={state}
                    disabled={!active || busy}
                    onClick={() => dig(index)}
                  />
                ))}
              </div>

              <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3 text-center">
                {active ? (
                  <>
                    <Pill tone="cyan">
                      {picks} / {MINES_TILES - mineCount} kaivettu
                    </Pill>
                    {picks > 0 && (
                      <>
                        <Pill tone="emerald">{formatMultiplier(multiplier)}</Pill>
                        <Pill tone="amber">+{formatCoins(profit)} coins</Pill>
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--text-faint)]">
                    Valitse miinojen määrä ja aloita kaivaminen.
                  </p>
                )}
              </div>
            </div>

            <div className="panel px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <Icon name="history" size={14} className="text-[var(--text-faint)]" />
                <p className="eyebrow text-[10px]">Viimeisimmät kaivaukset</p>
              </div>
              <HistoryStrip entries={history} />
            </div>
          </>
        }
        controls={
          <div className="panel-raised p-5">
            <BetPanel value={bet} onChange={setBet} min={min} max={max} disabled={active || busy}>
              <div className="mt-1">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label
                    htmlFor="mine-count"
                    className="text-[13px] font-medium text-[var(--text-dim)]"
                  >
                    Miinat
                  </label>
                  <span className="tabular text-[13px] font-semibold text-[var(--color-danger-400)]">
                    {mineCount}
                  </span>
                </div>
                <input
                  id="mine-count"
                  type="range"
                  min={1}
                  max={24}
                  value={mineCount}
                  disabled={active || busy}
                  onChange={(event) => setMineCount(Number(event.target.value))}
                  className="w-full accent-[var(--color-danger-500)]"
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[1, 3, 5, 10, 24].map((count) => (
                    <button
                      key={count}
                      type="button"
                      disabled={active || busy}
                      onClick={() => {
                        sound("click");
                        setMineCount(count);
                      }}
                      className={`min-h-[32px] flex-1 rounded-lg border px-2 text-[12px] font-semibold transition-colors ${
                        mineCount === count
                          ? "border-[color-mix(in_oklab,var(--color-danger-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_12%,transparent)] text-[var(--color-danger-400)]"
                          : "border-[var(--line)] text-[var(--text-muted)]"
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>

              {active ? (
                <button
                  type="button"
                  onClick={cashout}
                  disabled={busy || picks === 0}
                  className="btn btn-amber btn-lg mt-3 w-full"
                >
                  {picks === 0 ? "Kaiva ensin" : `Lunasta ${formatCoins(bet + profit)}`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={start}
                  disabled={busy}
                  className="btn btn-primary btn-lg mt-3 w-full"
                >
                  {busy ? "Avataan…" : "Aloita kaivaus"}
                </button>
              )}

              <dl className="mt-4 space-y-2 border-t border-[var(--line-soft)] pt-4">
                <Row label="Nykyinen kerroin" value={picks > 0 ? formatMultiplier(multiplier) : "—"} />
                <Row label="Seuraava kerroin" value={formatMultiplier(nextMultiplier)} />
                <Row
                  label="Nykyinen voitto"
                  value={<Coins amount={profit} size="sm" showMark={false} />}
                />
              </dl>
            </BetPanel>
          </div>
        }
      />
    </>
  );
}

function MineTile({
  index,
  state,
  disabled,
  onClick,
}: {
  index: number;
  state: TileState;
  disabled: boolean;
  onClick: () => void;
}) {
  const treasure = TREASURES[index % TREASURES.length];
  const flipped = state !== "hidden";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || flipped}
      aria-label={
        state === "hidden" ? `Kaiva ruutu ${index + 1}` : state === "safe" ? "Löysit aarteen" : "Miina"
      }
      className="group relative aspect-square w-full rounded-[10px] outline-offset-2 disabled:cursor-default"
      style={{ perspective: "600px" }}
    >
      <span
        className="relative block h-full w-full transition-transform duration-[420ms] ease-[var(--ease-decel)]"
        style={{
          transformStyle: "preserve-3d",
          transform: flipped ? "rotateY(180deg)" : "none",
        }}
      >
        {/* unexplored stone */}
        <span
          className="absolute inset-0 flex items-center justify-center rounded-[10px] border border-[var(--line)] bg-[linear-gradient(160deg,var(--color-obsidian-750),var(--color-obsidian-850))] transition-colors group-enabled:group-hover:border-[color-mix(in_oklab,var(--color-mint-500)_40%,transparent)]"
          style={{ backfaceVisibility: "hidden" }}
        >
          <svg viewBox="0 0 40 40" className="size-full opacity-25" aria-hidden="true">
            <path d="M8 12h9v9H8zM21 9h11v12H21zM6 25h13v9H6zM23 25h11v9H23z" fill="none" stroke="var(--color-frost-500)" strokeWidth="0.7" />
          </svg>
        </span>

        {/* uncovered */}
        <span
          className="absolute inset-0 flex items-center justify-center rounded-[10px] border"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            borderColor:
              state === "safe"
                ? "color-mix(in oklab, var(--color-mint-500) 40%, transparent)"
                : state === "mine"
                  ? "color-mix(in oklab, var(--color-danger-500) 62%, transparent)"
                  : "color-mix(in oklab, var(--color-danger-500) 24%, transparent)",
            background:
              state === "safe"
                ? "color-mix(in oklab, var(--color-mint-500) 10%, var(--color-obsidian-850))"
                : state === "mine"
                  ? "color-mix(in oklab, var(--color-danger-500) 24%, var(--color-obsidian-850))"
                  : "color-mix(in oklab, var(--color-danger-500) 8%, var(--color-obsidian-850))",
            boxShadow:
              state === "mine"
                ? "0 0 24px color-mix(in oklab, var(--color-danger-500) 45%, transparent)"
                : state === "safe"
                  ? "0 0 18px color-mix(in oklab, var(--color-mint-500) 22%, transparent)"
                  : "none",
          }}
        >
          {state === "safe" ? (
            <ItemIcon name={treasure} size={26} color="var(--color-mint-400)" />
          ) : (
            <ItemIcon
              name="ember"
              size={26}
              color={state === "mine" ? "var(--color-danger-400)" : "var(--color-danger-500)"}
            />
          )}
        </span>
      </span>
    </button>
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
