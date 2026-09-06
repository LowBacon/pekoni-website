"use client";

import { useEffect, useState } from "react";
import { formatCoins, formatMultiplier, formatPercent } from "@/lib/format";
import {
  LAST_HOPE_STAGES,
  MAX_STAGE,
  stageMultiplier,
  stageSurvivalChance,
} from "@/lib/games/lasthope";
import { Coins, Eyebrow, Pill } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icons";
import { GameLayout } from "./GameShell";
import BetPanel, { useWagerGuard } from "./BetPanel";
import HistoryStrip, { type HistoryEntry } from "./HistoryStrip";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Last Hope — the storm shrine.
 *
 * Every stage outcome was decided when the round opened. The escalating weather
 * is theatre; the odds are printed on screen and never change.
 */

type Phase = "idle" | "standing" | "resolving" | "lost" | "won";

export default function LastHopeGame({ min, max }: { min: number; max: number }) {
  const [bet, setBet] = useState(100);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [flash, setFlash] = useState<"safe" | "fail" | null>(null);

  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound, reducedMotion } = usePreferences();
  const toast = useToast();
  const { confirm, dialog } = useWagerGuard();

  const active = sessionId !== null;
  const multiplier = stage > 0 ? stageMultiplier(stage) : 0;
  const currentValue = stage > 0 ? Math.floor(bet * multiplier) : 0;
  const nextStage = Math.min(MAX_STAGE, stage + 1);
  const nextMultiplier = stageMultiplier(nextStage);
  const nextChance = stageSurvivalChance(nextStage);

  useEffect(() => {
    let cancelled = false;
    const resume = async () => {
      try {
        const response = await fetch("/api/games/lasthope", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          session: null | { sessionId: string; bet: number; stage: number };
        };
        if (cancelled || !data.session) return;
        setSessionId(data.session.sessionId);
        setBet(data.session.bet);
        setStage(data.session.stage);
        setPhase("standing");
      } catch {
        /* nothing to resume */
      }
    };
    void resume();
    return () => {
      cancelled = true;
    };
  }, []);

  const begin = async () => {
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
      const response = await fetch("/api/games/lasthope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", bet }),
      });
      const data = await response.json();
      if (!response.ok) {
        sound("error");
        toast.error(data.error ?? "Jokin meni pieleen.");
        return;
      }
      settle({ balance: data.balance });
      setSessionId(data.sessionId);
      setStage(0);
      setPhase("standing");
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!sessionId || busy) return;
    setBusy(true);
    setPhase("resolving");

    try {
      const response = await fetch("/api/games/lasthope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advance", sessionId }),
      });
      const data = await response.json();
      if (!response.ok) {
        sound("error");
        toast.error(data.error ?? "Jokin meni pieleen.");
        setPhase("standing");
        return;
      }

      // A held beat before the reveal — the shrine deciding.
      await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : 620));

      if (!data.survived) {
        setFlash("fail");
        sound("crashBust");
        setStage(data.stage);
        setPhase("lost");
        settle(data);
        setHistory((current) =>
          [
            { id: `${Date.now()}`, multiplier: 0, won: false, label: `Stage ${data.stage}` },
            ...current,
          ].slice(0, 14),
        );
        toast.error("Pyhäkkö luhistui.", `Vaihe ${data.stage} — ${data.stageName}`);
        setTimeout(() => {
          setSessionId(null);
          setStage(0);
          setPhase("idle");
          setFlash(null);
        }, 2_600);
        return;
      }

      setFlash("safe");
      setTimeout(() => setFlash(null), 700);
      setStage(data.stage);

      if (data.cleared) {
        sound("bigWin");
        setPhase("won");
        settle(data);
        setHistory((current) =>
          [
            { id: `${Date.now()}`, multiplier: data.multiplier, won: true, label: "Läpi" },
            ...current,
          ].slice(0, 14),
        );
        toast.reward(`+${formatCoins(data.profit)} coins`, "Sydänkammio saavutettu.");
        setTimeout(() => {
          setSessionId(null);
          setStage(0);
          setPhase("idle");
        }, 3_000);
        return;
      }

      sound("tileSafe");
      setPhase("standing");
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
      setPhase("standing");
    } finally {
      setBusy(false);
    }
  };

  const takeWin = async () => {
    if (!sessionId || busy || stage === 0) return;
    setBusy(true);
    try {
      const response = await fetch("/api/games/lasthope", {
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
      sound("cashout");
      settle(data);
      setHistory((current) =>
        [
          {
            id: `${Date.now()}`,
            multiplier: data.multiplier,
            won: true,
            label: formatMultiplier(data.multiplier),
          },
          ...current,
        ].slice(0, 14),
      );
      toast.success(`+${formatCoins(data.profit)} coins`, `Vaihe ${data.stage}`);
      setSessionId(null);
      setStage(0);
      setPhase("idle");
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setBusy(false);
    }
  };

  // Intensity 0–1 drives weather, lighting and screen treatment.
  const intensity = stage / MAX_STAGE;

  return (
    <>
      {dialog}
      <GameLayout
        surface={
          <>
            <div
              className={`panel-raised relative overflow-hidden ${
                flash === "fail" && !reducedMotion ? "shake" : ""
              }`}
            >
              <ShrineScene intensity={intensity} phase={phase} reducedMotion={reducedMotion} />

              <div
                className="pointer-events-none absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: flash ? 1 : 0,
                  background:
                    flash === "safe"
                      ? "radial-gradient(60% 50% at 50% 45%, color-mix(in oklab, var(--color-amber-400) 26%, transparent), transparent 70%)"
                      : "radial-gradient(60% 50% at 50% 45%, color-mix(in oklab, var(--color-danger-500) 30%, transparent), transparent 70%)",
                }}
              />

              <div className="relative px-5 py-8 sm:px-8">
                <div className="text-center">
                  <Eyebrow>
                    {active
                      ? `Vaihe ${Math.min(MAX_STAGE, stage + (phase === "standing" ? 1 : 0))} / ${MAX_STAGE}`
                      : "Pyhäkkö odottaa"}
                  </Eyebrow>
                  <p
                    className="tabular font-serif-display mt-2 text-[clamp(3rem,11vw,5.5rem)] leading-none transition-colors duration-500"
                    style={{
                      color:
                        phase === "lost"
                          ? "var(--color-danger-400)"
                          : stage > 0
                            ? "var(--color-amber-400)"
                            : "var(--text)",
                      textShadow:
                        stage > 0 && phase !== "lost"
                          ? "0 0 50px color-mix(in oklab, var(--color-amber-500) 40%, transparent)"
                          : "none",
                    }}
                    aria-live="polite"
                  >
                    {stage > 0 ? formatMultiplier(multiplier) : "1.00x"}
                  </p>
                  <p className="mt-2 min-h-[22px] text-sm text-[var(--text-muted)]">
                    {phase === "resolving"
                      ? "Myrsky ratkaisee…"
                      : phase === "lost"
                        ? "Matka päättyi tähän."
                        : phase === "won"
                          ? "Ancient artifact saavutettu."
                          : active
                            ? `Nykyinen voitto ${formatCoins(currentValue)} coins`
                            : "Viisi vaihetta. Yksi mahdollisuus kerrallaan."}
                  </p>
                </div>

                {/* Stage ladder */}
                <ol className="mt-8 grid grid-cols-5 gap-1.5 sm:gap-2.5">
                  {LAST_HOPE_STAGES.map((entry) => {
                    const cleared = stage >= entry.stage;
                    const current = active && stage + 1 === entry.stage;
                    return (
                      <li
                        key={entry.stage}
                        className="relative rounded-[10px] border px-2 py-3 text-center transition-all duration-500"
                        style={{
                          borderColor: cleared
                            ? "color-mix(in oklab, var(--color-amber-500) 45%, transparent)"
                            : current
                              ? "color-mix(in oklab, var(--color-frost-100) 22%, transparent)"
                              : "var(--line-soft)",
                          background: cleared
                            ? "color-mix(in oklab, var(--color-amber-500) 10%, transparent)"
                            : "color-mix(in oklab, var(--color-obsidian-950) 55%, transparent)",
                          boxShadow: cleared
                            ? "0 0 20px -6px color-mix(in oklab, var(--color-amber-500) 45%, transparent)"
                            : "none",
                        }}
                      >
                        <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-faint)]">
                          Stage {entry.stage}
                        </p>
                        <p
                          className="tabular mt-1 text-sm font-bold"
                          style={{
                            color: cleared ? "var(--color-amber-400)" : "var(--text-muted)",
                          }}
                        >
                          {entry.multiplier.toFixed(2)}x
                        </p>
                        <p className="mt-0.5 hidden truncate text-[10px] text-[var(--text-faint)] sm:block">
                          {entry.name}
                        </p>
                      </li>
                    );
                  })}
                </ol>

                {active && phase !== "lost" && phase !== "won" && (
                  <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
                    <button
                      type="button"
                      onClick={advance}
                      disabled={busy || stage >= MAX_STAGE}
                      className="btn btn-primary btn-lg flex-1"
                    >
                      JATKA
                      <span className="tabular font-normal opacity-70">
                        {formatMultiplier(nextMultiplier)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={takeWin}
                      disabled={busy || stage === 0}
                      className="btn btn-amber btn-lg flex-1"
                    >
                      OTA VOITTO
                      <span className="tabular font-normal opacity-70">
                        {formatCoins(currentValue)}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="panel px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-2">
                <Icon name="history" size={14} className="text-[var(--text-faint)]" />
                <p className="eyebrow text-[10px]">Aiemmat retket</p>
              </div>
              <HistoryStrip entries={history} />
            </div>
          </>
        }
        controls={
          <div className="panel-raised p-5">
            <BetPanel value={bet} onChange={setBet} min={min} max={max} disabled={active || busy}>
              {!active && (
                <button
                  type="button"
                  onClick={begin}
                  disabled={busy}
                  className="btn btn-primary btn-lg mt-1 w-full"
                >
                  {busy ? "Astutaan sisään…" : "Astu pyhäkköön"}
                </button>
              )}

              <dl className="mt-4 space-y-2 border-t border-[var(--line-soft)] pt-4">
                <Row label="Nykyinen kerroin" value={stage > 0 ? formatMultiplier(multiplier) : "—"} />
                <Row
                  label="Nykyinen voitto"
                  value={<Coins amount={stage > 0 ? currentValue - bet : 0} size="sm" showMark={false} />}
                />
                <div className="rule my-3" />
                <Row label={`Vaihe ${nextStage} kerroin`} value={formatMultiplier(nextMultiplier)} />
                <Row
                  label={`Vaihe ${nextStage} onnistuu`}
                  value={formatPercent(nextChance * 100, 1)}
                />
              </dl>

              <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line-soft)] px-3 py-2.5">
                <Icon name="info" size={14} className="mt-0.5 shrink-0 text-[var(--text-faint)]" />
                <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">
                  Jokaisen vaiheen odotusarvo on sama. Jatkaminen ei ole matemaattisesti parempi
                  eikä huonompi kuin voiton ottaminen — valinta on puhtaasti sinun.
                </p>
              </div>
            </BetPanel>
          </div>
        }
      />
    </>
  );
}

/** The shrine. Weather and light escalate with the stage. */
function ShrineScene({
  intensity,
  phase,
  reducedMotion,
}: {
  intensity: number;
  phase: Phase;
  reducedMotion: boolean;
}) {
  const rain = Math.round(18 + intensity * 46);

  return (
    <svg
      viewBox="0 0 800 320"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="lh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#05070c" />
          <stop offset="100%" stopColor={`hsl(230 ${18 + intensity * 14}% ${7 + intensity * 3}%)`} />
        </linearGradient>
        <radialGradient id="lh-core" cx="50%" cy="62%" r="42%">
          <stop offset="0%" stopColor="var(--color-amber-400)" stopOpacity={0.12 + intensity * 0.34} />
          <stop offset="100%" stopColor="var(--color-amber-400)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="320" fill="url(#lh-sky)" />

      {/* Lightning wash — only at higher stages */}
      {intensity > 0.4 && !reducedMotion && (
        <rect
          width="800"
          height="320"
          fill="#b9c9d6"
          style={{
            ["--flicker-low" as string]: "0",
            ["--flicker-high" as string]: String(0.05 + intensity * 0.09),
            animation: `flicker ${6 - intensity * 3}s linear infinite`,
          }}
        />
      )}

      {/* Mountain silhouette */}
      <path
        d="M-20 300 L90 190 L170 240 L260 140 L360 220 L470 120 L580 210 L700 150 L820 250 L820 320 L-20 320 Z"
        fill="#0a0f16"
      />

      {/* The shrine itself, growing more lit each stage */}
      <g transform="translate(400 300)">
        <rect x="-96" y="-14" width="192" height="14" fill="#0e141c" />
        <rect x="-78" y="-30" width="156" height="16" fill="#111823" />
        {[-64, -34, 34, 64].map((x) => (
          <rect key={x} x={x - 9} y={-118} width="18" height="88" fill="#141c27" />
        ))}
        <path d="M-92 -118 L0 -168 L92 -118 Z" fill="#111823" />
        {/* The artifact */}
        <g transform="translate(0 -74)">
          <circle r={16 + intensity * 8} fill="var(--color-amber-500)" opacity={0.1 + intensity * 0.3} />
          <path
            d="M0 -16 L11 0 L0 16 L-11 0 Z"
            fill="var(--color-amber-400)"
            opacity={0.35 + intensity * 0.6}
          />
        </g>
      </g>

      <rect width="800" height="320" fill="url(#lh-core)" />

      {/* Rain — density tracks the stage */}
      {!reducedMotion &&
        Array.from({ length: rain }).map((_, i) => {
          const x = (i * 137) % 800;
          const y = (i * 71) % 320;
          const length = 12 + intensity * 22;
          const slant = 3 + intensity * 9;
          return (
            <line
              key={i}
              x1={x}
              y1={y}
              x2={x - slant}
              y2={y + length}
              stroke="#8fb3c4"
              strokeWidth="1"
              opacity={0.1 + intensity * 0.22}
            />
          );
        })}

      {phase === "lost" && (
        <rect width="800" height="320" fill="var(--color-danger-600)" opacity="0.14" />
      )}
    </svg>
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
