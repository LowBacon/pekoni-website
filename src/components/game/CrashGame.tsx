"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCoins, formatMultiplier } from "@/lib/format";
import { multiplierAt } from "@/lib/games/crash";
import { Coins, Eyebrow, Pill } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icons";
import Avatar from "@/components/ui/Avatar";
import { GameLayout } from "./GameShell";
import BetPanel, { useWagerGuard } from "./BetPanel";
import HistoryStrip, { type HistoryEntry } from "./HistoryStrip";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Crash — the mountain ascent.
 *
 * The client redraws the curve from the server's `startedAt` stamp, but never
 * decides when the climb ends: every frame past the last known altitude asks the
 * server to settle, and the server answers from its own clock.
 */

type Phase = "idle" | "climbing" | "cashed" | "crashed";

const VIEW_W = 800;
const VIEW_H = 420;
/** Altitude the graph is scaled to; grows as the climb continues. */
const BASE_CEILING = 2.4;

export default function CrashGame({ min, max }: { min: number; max: number }) {
  const [bet, setBet] = useState(50);
  const [autoCashout, setAutoCashout] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [multiplier, setMultiplier] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [outcome, setOutcome] = useState<{
    busted: boolean;
    multiplier: number;
    profit: number;
    auto: boolean;
  } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound, soundPitched, reducedMotion } = usePreferences();
  const toast = useToast();
  const { confirm, dialog } = useWagerGuard();

  const frame = useRef(0);
  const settling = useRef(false);
  const lastTick = useRef(0);
  const lastSettle = useRef(0);

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
  }, []);

  useEffect(() => stop, [stop]);

  /** Picks an interrupted ascent back up rather than stranding the stake. */
  useEffect(() => {
    let cancelled = false;
    const resume = async () => {
      try {
        const response = await fetch("/api/games/crash", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          session: null | { sessionId: string; bet: number; startedAt: number; autoCashout: number | null };
        };
        if (cancelled || !data.session) return;
        setSessionId(data.session.sessionId);
        setBet(data.session.bet);
        setStartedAt(data.session.startedAt);
        if (data.session.autoCashout) setAutoCashout(String(data.session.autoCashout));
        setPhase("climbing");
      } catch {
        /* nothing to resume */
      }
    };
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Asks the server to close the round. `manual` distinguishes a cash-out. */
  const close = useCallback(
    async (action: "cashout" | "settle") => {
      if (!sessionId || settling.current) return;
      settling.current = true;
      if (action === "cashout") setBusy(true);

      try {
        const response = await fetch("/api/games/crash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, sessionId }),
        });
        const data = await response.json();

        if (!response.ok) {
          sound("error");
          toast.error(data.error ?? "Jokin meni pieleen.");
          stop();
          setPhase("idle");
          setSessionId(null);
          return;
        }

        if (data.pending) {
          // Server says the climb is still going — keep animating.
          settling.current = false;
          return;
        }

        stop();
        settle(data);
        setMultiplier(data.busted ? data.crashPoint : data.multiplier);
        setPhase(data.busted ? "crashed" : "cashed");
        setOutcome({
          busted: data.busted,
          multiplier: data.busted ? data.crashPoint : data.multiplier,
          profit: data.profit,
          auto: data.auto,
        });
        setHistory((current) =>
          [
            {
              id: `${Date.now()}-${Math.random()}`,
              multiplier: data.crashPoint,
              won: !data.busted,
              label: formatMultiplier(data.crashPoint),
            },
            ...current,
          ].slice(0, 16),
        );

        if (data.busted) {
          sound("crashBust");
        } else {
          sound(data.multiplier >= 5 ? "bigWin" : "cashout");
          toast.success(`+${formatCoins(data.profit)} coins`, formatMultiplier(data.multiplier));
        }

        setSessionId(null);
      } catch {
        sound("error");
        toast.error("Palvelimeen ei saatu yhteyttä.");
        stop();
        setPhase("idle");
      } finally {
        settling.current = false;
        setBusy(false);
      }
    },
    [sessionId, settle, sound, stop, toast],
  );

  /** Animation loop — pure presentation, driven by the shared start time. */
  useEffect(() => {
    if (phase !== "climbing" || !startedAt) return;

    const target = Number(autoCashout);
    const hasAuto = Number.isFinite(target) && target > 1;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const value = multiplierAt(elapsed);
      setMultiplier(value);

      if (!reducedMotion && elapsed - lastTick.current > 140) {
        lastTick.current = elapsed;
        soundPitched("crashTick", value / 6);
      }

      // The server decides; we simply ask once the target or a long climb passes.
      if (hasAuto && value >= target) {
        void close("cashout");
        return;
      }

      // Poll the server for the end of the climb. The client's own curve is
      // never authoritative — it just decides how often to ask.
      if (elapsed - lastSettle.current > 850) {
        lastSettle.current = elapsed;
        void close("settle");
      }

      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return stop;
  }, [phase, startedAt, autoCashout, close, reducedMotion, soundPitched, stop]);

  const launch = async () => {
    if (busy || phase === "climbing") return;
    if (bet > balance) {
      sound("error");
      toast.error("Coinit eivät riitä.");
      return;
    }
    if (!(await confirm(bet, balance))) return;

    setBusy(true);
    setOutcome(null);
    sound("bet");

    try {
      const auto = autoCashout.trim() === "" ? null : Number(autoCashout);
      const response = await fetch("/api/games/crash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", bet, autoCashout: auto }),
      });
      const data = await response.json();
      if (!response.ok) {
        sound("error");
        toast.error(data.error ?? "Jokin meni pieleen.");
        return;
      }

      settle({ balance: data.balance });
      setSessionId(data.sessionId);
      setStartedAt(data.startedAt);
      setMultiplier(1);
      lastTick.current = 0;
      lastSettle.current = 0;
      setPhase("climbing");
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setBusy(false);
    }
  };

  const ceiling = Math.max(BASE_CEILING, multiplier * 1.18);
  const progress = Math.min(1, Math.log(multiplier) / Math.log(ceiling) || 0);
  const clarity = Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(10));

  return (
    <>
      {dialog}
      <GameLayout
        surface={
          <>
            <div
              className={`panel-raised relative overflow-hidden ${
                phase === "crashed" && !reducedMotion ? "shake" : ""
              }`}
            >
              <AscentGraph
                progress={progress}
                clarity={clarity}
                phase={phase}
                reducedMotion={reducedMotion}
              />

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p
                  className="tabular font-serif-display text-[clamp(3.2rem,12vw,6.5rem)] leading-none transition-colors duration-300"
                  style={{
                    color:
                      phase === "crashed"
                        ? "var(--color-danger-400)"
                        : phase === "cashed"
                          ? "var(--color-emerald-300)"
                          : "var(--text)",
                    textShadow:
                      phase === "climbing"
                        ? "0 0 50px color-mix(in oklab, var(--color-cyan-500) 40%, transparent)"
                        : phase === "cashed"
                          ? "0 0 60px color-mix(in oklab, var(--color-emerald-500) 45%, transparent)"
                          : "none",
                  }}
                  aria-live="polite"
                >
                  {formatMultiplier(multiplier)}
                </p>

                <div className="mt-2 min-h-[26px] text-center">
                  {phase === "crashed" && outcome && (
                    <p className="rise text-sm font-semibold uppercase tracking-[0.16em] text-[var(--color-danger-400)]">
                      Matka päättyi @ {formatMultiplier(outcome.multiplier)}
                    </p>
                  )}
                  {phase === "cashed" && outcome && (
                    <p className="rise text-sm font-semibold text-[var(--color-emerald-400)]">
                      Lunastit {formatMultiplier(outcome.multiplier)} · +{formatCoins(outcome.profit)} coins
                      {outcome.auto ? " (auto)" : ""}
                    </p>
                  )}
                  {phase === "climbing" && (
                    <p className="text-sm text-[var(--text-muted)]">Nousu käynnissä…</p>
                  )}
                  {phase === "idle" && (
                    <p className="text-sm text-[var(--text-faint)]">
                      Aseta panos ja lähde vuorelle.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="panel px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <Icon name="history" size={14} className="text-[var(--text-faint)]" />
                <p className="eyebrow text-[10px]">Aiemmat nousut</p>
              </div>
              <HistoryStrip entries={history} emptyLabel="Et ole vielä pelannut yhtään peliä." />
            </div>

            <LiveBets />
          </>
        }
        controls={
          <div className="panel-raised p-5">
            <BetPanel
              value={bet}
              onChange={setBet}
              min={min}
              max={max}
              disabled={phase === "climbing" || busy}
              extra={
                <div>
                  <label
                    htmlFor="auto-cashout"
                    className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]"
                  >
                    Automaattinen lunastus
                  </label>
                  <div className="relative">
                    <input
                      id="auto-cashout"
                      type="text"
                      inputMode="decimal"
                      className="field tabular pr-9"
                      placeholder="Ei käytössä"
                      value={autoCashout}
                      disabled={phase === "climbing" || busy}
                      onChange={(event) =>
                        setAutoCashout(event.target.value.replace(/[^\d.]/g, "").slice(0, 8))
                      }
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[var(--text-faint)]">
                      x
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-faint)]">
                    Palvelin lunastaa puolestasi — verkon viive ei vaikuta tulokseen.
                  </p>
                </div>
              }
            >
              {phase === "climbing" ? (
                <button
                  type="button"
                  onClick={() => void close("cashout")}
                  disabled={busy}
                  className="btn btn-amber btn-lg mt-1 w-full"
                >
                  Lunasta {formatCoins(Math.floor(bet * multiplier))}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={launch}
                  disabled={busy}
                  className="btn btn-primary btn-lg mt-1 w-full"
                >
                  {busy ? "Valmistaudutaan…" : "Aloita nousu"}
                </button>
              )}

              <dl className="mt-4 space-y-2 border-t border-[var(--line-soft)] pt-4">
                <Row label="Nykyinen kerroin" value={formatMultiplier(multiplier)} />
                <Row
                  label="Mahdollinen voitto"
                  value={
                    <Coins
                      amount={phase === "climbing" ? Math.floor(bet * multiplier) - bet : 0}
                      size="sm"
                      showMark={false}
                    />
                  }
                />
              </dl>
            </BetPanel>
          </div>
        }
      />
    </>
  );
}

/**
 * The ascent. An abstract glowing path climbing a mountain valley — the fog
 * lifts and the ridges sharpen as altitude increases.
 */
function AscentGraph({
  progress,
  clarity,
  phase,
  reducedMotion,
}: {
  progress: number;
  clarity: number;
  phase: Phase;
  reducedMotion: boolean;
}) {
  const points: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * progress;
    const x = 60 + t * (VIEW_W - 120);
    // Exponential climb, eased into the frame.
    const y = VIEW_H - 60 - Math.pow(t, 1.55) * (VIEW_H - 130);
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const path = points.join(" ");
  const headX = 60 + progress * (VIEW_W - 120);
  const headY = VIEW_H - 60 - Math.pow(progress, 1.55) * (VIEW_H - 130);

  const crashed = phase === "crashed";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="block h-[300px] w-full sm:h-[420px]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="crash-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#070d13" />
          <stop offset="100%" stopColor="#101c25" />
        </linearGradient>
        <linearGradient id="crash-path" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-cyan-500)" />
          <stop offset="60%" stopColor="var(--color-mint-400)" />
          <stop offset="100%" stopColor="var(--color-emerald-300)" />
        </linearGradient>
        <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-mint-500)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-mint-500)" stopOpacity="0" />
        </linearGradient>
        <filter id="crash-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={VIEW_W} height={VIEW_H} fill="url(#crash-sky)" />

      {/* Far ridges sharpen as the climb continues */}
      <path
        d={`M -20 ${VIEW_H - 90} L 110 ${VIEW_H - 190} L 200 ${VIEW_H - 140} L 320 ${VIEW_H - 250} L 430 ${VIEW_H - 170} L 560 ${VIEW_H - 280} L 700 ${VIEW_H - 190} L 830 ${VIEW_H - 250} L 830 ${VIEW_H} L -20 ${VIEW_H} Z`}
        fill="#16242f"
        opacity={0.35 + clarity * 0.45}
      />
      <path
        d={`M -20 ${VIEW_H - 40} L 90 ${VIEW_H - 110} L 210 ${VIEW_H - 70} L 340 ${VIEW_H - 150} L 470 ${VIEW_H - 90} L 620 ${VIEW_H - 160} L 830 ${VIEW_H - 80} L 830 ${VIEW_H} L -20 ${VIEW_H} Z`}
        fill="#0d161d"
        opacity={0.6 + clarity * 0.4}
      />

      {/* Fog that lifts with altitude */}
      <rect
        width={VIEW_W}
        height={VIEW_H}
        fill="#7fa9b5"
        opacity={Math.max(0, 0.16 - clarity * 0.15)}
      />

      {/* Gridlines */}
      {[1, 2, 3].map((line) => (
        <line
          key={line}
          x1={40}
          x2={VIEW_W - 40}
          y1={VIEW_H - 60 - (line * (VIEW_H - 130)) / 4}
          y2={VIEW_H - 60 - (line * (VIEW_H - 130)) / 4}
          stroke="var(--color-frost-100)"
          strokeOpacity="0.05"
          strokeDasharray="4 8"
        />
      ))}

      {progress > 0.001 && (
        <>
          <path d={`${path} L ${headX} ${VIEW_H - 60} L 60 ${VIEW_H - 60} Z`} fill="url(#crash-fill)" />
          <path
            d={path}
            fill="none"
            stroke={crashed ? "var(--color-danger-500)" : "url(#crash-path)"}
            strokeWidth={3}
            strokeLinecap="round"
            filter={reducedMotion ? undefined : "url(#crash-glow)"}
            strokeDasharray={crashed ? "14 9" : undefined}
          />
          {!crashed && (
            <circle
              cx={headX}
              cy={headY}
              r={7}
              fill="var(--color-emerald-300)"
              filter={reducedMotion ? undefined : "url(#crash-glow)"}
            />
          )}
          {crashed && (
            <g>
              <path
                d={`M ${headX - 26} ${headY + 20} L ${headX - 6} ${headY - 6} L ${headX + 8} ${headY + 14} L ${headX + 30} ${headY - 16}`}
                fill="none"
                stroke="var(--color-danger-400)"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle cx={headX} cy={headY} r={10} fill="var(--color-danger-500)" opacity="0.45" />
            </g>
          )}
        </>
      )}
    </svg>
  );
}

/**
 * Live bets. Reads the public activity feed and shows only crash wins, so no
 * private information ever reaches this list.
 */
function LiveBets() {
  const [items, setItems] = useState<
    { id: string; username: string; minecraftUsername: string | null; label: string; amount: number | null }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/activity?limit=20", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled) return;
        setItems(
          data.feed
            .filter((item: { label: string }) => item.label.includes("Crash"))
            .slice(0, 6),
        );
      } catch {
        /* ignore */
      }
    };
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="panel p-4">
      <Eyebrow className="mb-3">Live Bets</Eyebrow>
      {items.length === 0 ? (
        <p className="text-[13px] text-[var(--text-faint)]">
          Kukaan ei ole vielä lunastanut Crashissa tänään.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2.5">
              <Avatar
                username={item.username}
                minecraftUsername={item.minecraftUsername}
                size={24}
                ring
              />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-muted)]">
                {item.username}
              </span>
              {item.amount !== null && (
                <Pill tone="emerald">+{formatCoins(item.amount)}</Pill>
              )}
            </li>
          ))}
        </ul>
      )}
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
