"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCoins } from "@/lib/format";
import {
  COMBO_TIERS,
  MOB_BY_KEY,
  ROUND_DURATION_MS,
  comboMultiplier,
} from "@/lib/games/mobgrinder";
import { RARITY_META, type Rarity } from "@/lib/enums";
import { Coins, Eyebrow, Pill, ProgressBar } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icons";
import { GameLayout } from "./GameShell";
import BetPanel, { useWagerGuard } from "./BetPanel";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Mob Grinder — the overgrown ruin.
 *
 * The client draws the arena and reports hits; the server owns every hit point,
 * crit roll and coin. Hits are batched on a short interval so a fast player is
 * responsive without flooding the endpoint.
 */

type Spawn = {
  id: number;
  kind: string;
  hp: number;
  maxHp: number;
  reward: number;
  spawnAt: number;
  despawnAt: number;
  wave: number;
  x: number;
  y: number;
};

type Floater = {
  id: string;
  x: number;
  y: number;
  text: string;
  crit: boolean;
  kill: boolean;
};

const FLUSH_INTERVAL_MS = 190;

export default function MobGrinderGame({ min, max }: { min: number; max: number }) {
  const [bet, setBet] = useState(100);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [spawns, setSpawns] = useState<Spawn[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [pot, setPot] = useState(0);
  const [kills, setKills] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    payout: number;
    profit: number;
    kills: number;
    bestCombo: number;
    rareKills: number;
  } | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);

  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound, reducedMotion } = usePreferences();
  const toast = useToast();
  const { confirm, dialog } = useWagerGuard();

  const startedAt = useRef(0);
  const queue = useRef(new Map<number, number>());
  const flushing = useRef(false);
  const frame = useRef(0);
  const finishing = useRef(false);

  const finish = useCallback(
    async (id: string) => {
      if (finishing.current) return;
      finishing.current = true;
      setRunning(false);

      try {
        const response = await fetch("/api/games/mobgrinder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "finish", sessionId: id }),
        });
        const data = await response.json();
        if (!response.ok) {
          sound("error");
          toast.error(data.error ?? "Jokin meni pieleen.");
          return;
        }
        settle(data);
        setSummary({
          payout: data.payout,
          profit: data.profit,
          kills: data.kills,
          bestCombo: data.bestCombo,
          rareKills: data.rareKills,
        });
        if (data.profit > 0) {
          sound("bigWin");
          toast.success(`+${formatCoins(data.profit)} coins`, `${data.kills} mobia kaadettu`);
        } else {
          sound("lose");
        }
        setSessionId(null);
      } catch {
        sound("error");
        toast.error("Palvelimeen ei saatu yhteyttä.");
      } finally {
        finishing.current = false;
      }
    },
    [settle, sound, toast],
  );

  /** Sends the queued hits and folds the authoritative response back in. */
  const flush = useCallback(
    async (id: string) => {
      if (flushing.current || queue.current.size === 0) return;
      flushing.current = true;

      const hits = [...queue.current.entries()].map(([mobId, count]) => ({ mobId, count }));
      queue.current.clear();

      try {
        const response = await fetch("/api/games/mobgrinder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "attack", sessionId: id, hits: hits.slice(0, 12) }),
        });
        if (!response.ok) return;
        const data = await response.json();

        setPot(data.pot);
        setKills(data.kills);
        setCombo(data.combo);
        setBestCombo(data.bestCombo);

        const nextFloaters: Floater[] = [];
        setSpawns((current) => {
          const map = new Map(current.map((spawn) => [spawn.id, { ...spawn }]));
          for (const event of data.events as {
            mobId: number;
            damage: number;
            crit: boolean;
            killed: boolean;
            reward: number;
            hp: number;
          }[]) {
            const spawn = map.get(event.mobId);
            if (!spawn) continue;
            spawn.hp = event.hp;
            nextFloaters.push({
              id: `${event.mobId}-${Math.random()}`,
              x: spawn.x,
              y: spawn.y,
              text: event.killed ? `+${event.reward}` : String(event.damage),
              crit: event.crit,
              kill: event.killed,
            });
            if (event.killed) sound("kill");
            else if (event.crit) sound("crit");
          }
          return [...map.values()];
        });

        if (nextFloaters.length > 0 && !reducedMotion) {
          setFloaters((current) => [...current.slice(-14), ...nextFloaters]);
          setTimeout(
            () =>
              setFloaters((current) =>
                current.filter((item) => !nextFloaters.some((added) => added.id === item.id)),
              ),
            900,
          );
        }
      } catch {
        /* a dropped batch simply means those hits did not land */
      } finally {
        flushing.current = false;
      }
    },
    [reducedMotion, sound],
  );

  /** Clock + batching loop. */
  useEffect(() => {
    if (!running || !sessionId) return;

    let lastFlush = 0;
    const tick = () => {
      const now = Date.now() - startedAt.current;
      setElapsed(now);

      if (now - lastFlush > FLUSH_INTERVAL_MS) {
        lastFlush = now;
        void flush(sessionId);
      }

      if (now >= ROUND_DURATION_MS) {
        void flush(sessionId).then(() => finish(sessionId));
        return;
      }

      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [running, sessionId, flush, finish]);

  const start = async () => {
    if (busy || running) return;
    if (bet > balance) {
      sound("error");
      toast.error("Coinit eivät riitä.");
      return;
    }
    if (!(await confirm(bet, balance))) return;

    setBusy(true);
    setSummary(null);
    sound("bet");

    try {
      const response = await fetch("/api/games/mobgrinder", {
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
      setSpawns(data.spawns);
      setPot(0);
      setKills(0);
      setCombo(0);
      setBestCombo(0);
      setElapsed(0);
      queue.current.clear();
      startedAt.current = Date.now();
      setRunning(true);
    } catch {
      sound("error");
      toast.error("Palvelimeen ei saatu yhteyttä.");
    } finally {
      setBusy(false);
    }
  };

  const strike = (spawn: Spawn) => {
    if (!running) return;
    queue.current.set(spawn.id, (queue.current.get(spawn.id) ?? 0) + 1);
    sound("hit");
    // Optimistic feedback only — the server's number replaces this on the next flush.
    setSpawns((current) =>
      current.map((item) =>
        item.id === spawn.id ? { ...item, hp: Math.max(0, item.hp - 10) } : item,
      ),
    );
  };

  const visible = spawns.filter(
    (spawn) => spawn.hp > 0 && elapsed >= spawn.spawnAt && elapsed <= spawn.despawnAt,
  );
  const remaining = Math.max(0, ROUND_DURATION_MS - elapsed);
  const wave = Math.min(6, Math.floor((elapsed / ROUND_DURATION_MS) * 6) + 1);
  const activeTier = [...COMBO_TIERS].reverse().find((tier) => combo >= tier.combo);

  return (
    <>
      {dialog}
      <GameLayout
        surface={
          <>
            <div className="panel-raised relative overflow-hidden">
              {/* Arena */}
              <div
                className="relative aspect-[16/10] w-full touch-manipulation select-none sm:aspect-[16/9]"
                style={{
                  background:
                    "radial-gradient(90% 70% at 50% 20%, #16211a 0%, #0b120e 55%, #070c09 100%)",
                }}
              >
                <RuinBackdrop intensity={wave / 6} />

                {visible.map((spawn) => (
                  <MobTarget
                    key={spawn.id}
                    spawn={spawn}
                    onStrike={() => strike(spawn)}
                    reducedMotion={reducedMotion}
                  />
                ))}

                {floaters.map((floater) => (
                  <span
                    key={floater.id}
                    className="pointer-events-none absolute z-20 text-sm font-bold"
                    style={{
                      left: `${floater.x * 100}%`,
                      top: `${floater.y * 100}%`,
                      color: floater.kill
                        ? "var(--color-amber-400)"
                        : floater.crit
                          ? "var(--color-danger-400)"
                          : "var(--color-frost-100)",
                      animation: "damageFloat 900ms var(--ease-decel) forwards",
                      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                    }}
                  >
                    {floater.text}
                  </span>
                ))}

                {/* Idle / summary overlay */}
                {!running && (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[rgba(6,10,7,0.78)] px-6 text-center backdrop-blur-[2px]">
                    {summary ? (
                      <div className="rise">
                        <Eyebrow>Kierros päättyi</Eyebrow>
                        <p className="tabular font-serif-display mt-2 text-5xl leading-none text-[var(--color-amber-400)]">
                          +{formatCoins(summary.payout)}
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          <Pill tone="emerald">{summary.kills} kaatoa</Pill>
                          <Pill tone="violet">Paras combo {summary.bestCombo}×</Pill>
                          {summary.rareKills > 0 && (
                            <Pill tone="amber">{summary.rareKills} harvinaista</Pill>
                          )}
                        </div>
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                          Nettotulos {summary.profit >= 0 ? "+" : "−"}
                          {formatCoins(Math.abs(summary.profit))} coins
                        </p>
                      </div>
                    ) : (
                      <>
                        <Icon name="skull" size={30} className="text-[var(--color-emerald-500)]" />
                        <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
                          Raunio herää 50 sekunniksi. Napauta mobeja ennen kuin ne katoavat — ketju
                          kasvattaa palkkiota.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* HUD */}
                {running && (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3 sm:p-4">
                    <div className="rounded-xl border border-[var(--line)] bg-[rgba(6,10,7,0.72)] px-3 py-2 backdrop-blur">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
                        Aalto {wave} / 6
                      </p>
                      <p className="tabular mt-0.5 text-lg font-bold text-[var(--color-amber-400)]">
                        {formatCoins(pot)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="tabular text-2xl font-bold text-[var(--text)]">
                        {(remaining / 1000).toFixed(1)}s
                      </p>
                      {combo >= 2 && (
                        <p
                          className="tabular mt-1 text-sm font-bold"
                          style={{
                            color: activeTier ? "var(--color-amber-400)" : "var(--color-emerald-400)",
                          }}
                        >
                          {combo}× combo
                          {activeTier && (
                            <span className="ml-1 opacity-70">
                              ({comboMultiplier(combo).toFixed(2)}×)
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {running && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
                    <ProgressBar
                      value={1 - remaining / ROUND_DURATION_MS}
                      accent="var(--color-danger-500)"
                      label="Kierroksen edistyminen"
                    />
                  </div>
                )}
              </div>
            </div>

            <BestiaryCard />
          </>
        }
        controls={
          <div className="panel-raised p-5">
            <BetPanel
              value={bet}
              onChange={setBet}
              min={min}
              max={max}
              disabled={running || busy}
              label="Panos (varusteet)"
            >
              <button
                type="button"
                onClick={start}
                disabled={running || busy}
                className="btn btn-primary btn-lg mt-1 w-full"
              >
                {busy ? "Herätetään raunio…" : running ? "Käynnissä" : "Aloita kierros"}
              </button>

              <dl className="mt-4 space-y-2 border-t border-[var(--line-soft)] pt-4">
                <Row label="Kertynyt potti" value={<Coins amount={pot} size="sm" showMark={false} />} />
                <Row label="Kaatoja" value={String(kills)} />
                <Row label="Paras combo" value={`${bestCombo}×`} />
              </dl>

              <div className="mt-4">
                <p className="eyebrow mb-2 text-[10px]">Combo-tasot</p>
                <ul className="space-y-1">
                  {COMBO_TIERS.map((tier) => (
                    <li
                      key={tier.combo}
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[12px] transition-colors"
                      style={{
                        background:
                          combo >= tier.combo
                            ? "color-mix(in oklab, var(--color-amber-500) 12%, transparent)"
                            : "transparent",
                        color:
                          combo >= tier.combo ? "var(--color-amber-400)" : "var(--text-faint)",
                      }}
                    >
                      <span className="font-semibold">{tier.label}</span>
                      <span className="tabular">{tier.multiplier.toFixed(2)}× palkkio</span>
                    </li>
                  ))}
                </ul>
              </div>
            </BetPanel>
          </div>
        }
      />
    </>
  );
}

function MobTarget({
  spawn,
  onStrike,
  reducedMotion,
}: {
  spawn: Spawn;
  onStrike: () => void;
  reducedMotion: boolean;
}) {
  const kind = MOB_BY_KEY.get(spawn.kind);
  if (!kind) return null;
  const meta = RARITY_META[kind.rarity as Rarity];
  const health = spawn.hp / spawn.maxHp;
  const size = 38 + (kind.hp / 420) * 34;

  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        onStrike();
      }}
      aria-label={`Hyökkää: ${kind.name}`}
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full outline-offset-4 active:scale-90"
      style={{
        left: `${spawn.x * 100}%`,
        top: `${spawn.y * 100}%`,
        width: size,
        height: size,
        transition: "transform 90ms var(--ease-out-soft)",
        animation: reducedMotion ? undefined : "floatY 2.6s ease-in-out infinite",
        animationDelay: `${(spawn.id % 7) * 0.22}s`,
      }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, color-mix(in oklab, ${meta.color} 26%, transparent), transparent 70%)`,
          boxShadow: `0 0 ${12 + meta.rank * 5}px color-mix(in oklab, ${meta.color} ${20 + meta.rank * 8}%, transparent)`,
        }}
      />
      <MobGlyph kind={spawn.kind} color={meta.color} />
      {/* Health ring */}
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="2.5" />
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke={meta.color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${health * 113} 113`}
          style={{ transition: "stroke-dasharray 140ms linear" }}
        />
      </svg>
    </button>
  );
}

/** Original silhouettes — voxel-inspired, not traced from any existing artwork. */
function MobGlyph({ kind, color }: { kind: string; color: string }) {
  const shapes: Record<string, React.ReactNode> = {
    zombie: <path d="M12 10h16v18H12z M15 15h3v3h-3z M22 15h3v3h-3z M15 23h10v2H15z" />,
    spider: <path d="M14 15h12v10H14z M8 14l6 3 M8 26l6-3 M32 14l-6 3 M32 26l-6-3 M17 18h2v2h-2z M21 18h2v2h-2z" />,
    skeleton: <path d="M13 9h14v14H13z M16 14h3v3h-3z M21 14h3v3h-3z M17 20h6v1.5h-6z M18 23v8 M22 23v8" />,
    creeper: <path d="M11 9h18v22H11z M15 14h4v4h-4z M21 14h4v4h-4z M17 20h6v6h-6z M15 20h2v3h-2z M23 20h2v3h-2z" />,
    enderman: <path d="M14 6h12v28H14z M16 12h3v3h-3z M21 12h3v3h-3z M10 14l4 2 M30 14l-4 2" />,
    witch: <path d="M12 14h16v14H12z M8 14h24l-12-8z M16 19h3v3h-3z M21 19h3v3h-3z M26 26l5 6" />,
    armored_zombie: <path d="M10 9h20v22H10z M14 14h4v4h-4z M22 14h4v4h-4z M10 21h20v2H10z M14 25h12v2H14z M6 12h4v10H6z M30 12h4v10h-4z" />,
    ancient_skeleton: <path d="M12 7h16v16H12z M16 13h3v3h-3z M21 13h3v3h-3z M17 19h6v1.5h-6z M8 10l4-3 M32 10l-4-3 M18 23v10 M22 23v10" />,
    charged_creeper: <path d="M11 9h18v22H11z M15 14h4v4h-4z M21 14h4v4h-4z M17 20h6v6h-6z M6 6l5 6 M34 6l-5 6 M6 32l5-6 M34 32l-5-6" />,
    corrupted_enderman: <path d="M13 4h14v32H13z M16 11h3v4h-3z M21 11h3v4h-3z M6 12l7 3 M34 12l-7 3 M8 26l5-3 M32 26l-5-3" />,
  };

  return (
    <svg viewBox="0 0 40 40" className="absolute inset-0" aria-hidden="true">
      <g
        fill={color}
        fillOpacity="0.85"
        stroke={color}
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {shapes[kind] ?? shapes.zombie}
      </g>
    </svg>
  );
}

function RuinBackdrop({ intensity }: { intensity: number }) {
  return (
    <svg
      viewBox="0 0 800 450"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id="grinder-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b2620" />
          <stop offset="100%" stopColor="#0d150f" />
        </linearGradient>
      </defs>

      {/* Broken columns forming the grinder chamber */}
      {[70, 200, 600, 730].map((x, i) => (
        <g key={x} opacity={0.7}>
          <rect x={x - 26} y={90 + i * 14} width="52" height={330 - i * 14} fill="url(#grinder-stone)" />
          <rect x={x - 34} y={78 + i * 14} width="68" height="16" fill="#16201a" />
        </g>
      ))}

      {/* Arches at the back */}
      <path
        d="M300 420 L300 220 Q400 140 500 220 L500 420 L470 420 L470 232 Q400 178 330 232 L330 420 Z"
        fill="#101a14"
        opacity="0.85"
      />

      {/* Moss creeping in as waves escalate */}
      <path
        d="M-10 430 Q120 400 250 424 T520 418 T810 430 L810 460 L-10 460 Z"
        fill="#1c2c1e"
        opacity={0.5 + intensity * 0.4}
      />

      {/* Torchlight */}
      <circle cx="70" cy="120" r="70" fill="var(--color-amber-500)" opacity={0.05 + intensity * 0.05} />
      <circle cx="730" cy="120" r="70" fill="var(--color-amber-500)" opacity={0.05 + intensity * 0.05} />
      <rect
        width="800"
        height="450"
        fill="var(--color-danger-600)"
        opacity={intensity > 0.7 ? (intensity - 0.7) * 0.16 : 0}
      />
    </svg>
  );
}

function BestiaryCard() {
  const groups = [...MOB_BY_KEY.values()];
  return (
    <div className="panel p-5">
      <Eyebrow className="mb-3">Bestiaario</Eyebrow>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {groups.map((mob) => {
          const meta = RARITY_META[mob.rarity as Rarity];
          return (
            <li
              key={mob.key}
              className="flex items-center gap-2.5 rounded-lg border border-[var(--line-soft)] px-2.5 py-2"
            >
              <span className="relative size-7 shrink-0">
                <MobGlyph kind={mob.key} color={meta.color} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[var(--text-dim)]">
                  {mob.name}
                </span>
                <span className="block truncate text-[10px] text-[var(--text-faint)]">
                  {mob.ability}
                </span>
              </span>
              <span
                className="tabular shrink-0 text-[11px] font-bold"
                style={{ color: meta.color }}
              >
                {mob.hp} HP
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
        Palkkiot skaalautuvat panokseen. Koko aaltosarjan kaataminen ilman comboa vastaa 1,45×
        panosta; combot nostavat tuloksen ylöspäin, ja kierros on katkaistu 3,5× kohdalle.
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
