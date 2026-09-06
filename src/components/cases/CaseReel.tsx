"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RARITY_META, type Rarity } from "@/lib/enums";
import { formatCoins } from "@/lib/format";
import { Icon } from "@/components/ui/Icons";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export type ReelItem = {
  id: string;
  name: string;
  rarity: Rarity;
  icon: string;
  value: number;
};

const CELL = 116;
const GAP = 10;
const STRIDE = CELL + GAP;
const SPIN_MS = 5_600;

/**
 * The reward reel.
 *
 * Purely presentational: the winning item was chosen on the server before this
 * component ever mounted, and `winningIndex` only tells the animation where to
 * stop. Nothing here can change what was won.
 */
export default function CaseReel({
  items,
  winningIndex,
  spinning,
  onSettled,
  accent = "var(--color-amber-400)",
}: {
  items: ReelItem[];
  winningIndex: number;
  spinning: boolean;
  onSettled?: () => void;
  accent?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const { reducedMotion, soundPitched, sound } = usePreferences();

  // Landing position: the winning cell centred under the marker, nudged by a
  // deterministic amount so the stop never looks mechanically identical.
  useLayoutEffect(() => {
    if (!spinning || items.length === 0) return;
    const width = viewport.current?.offsetWidth ?? 0;
    const jitter = ((winningIndex * 37) % 41) - 20;
    const target = winningIndex * STRIDE + CELL / 2 - width / 2 + jitter;

    if (reducedMotion) {
      setAnimating(false);
      setOffset(target);
      settleOnce();
      return;
    }

    setAnimating(false);
    setOffset(0);

    const start = requestAnimationFrame(() => {
      setAnimating(true);
      setOffset(target);
    });
    return () => cancelAnimationFrame(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winningIndex, items.length, reducedMotion]);

  /*
    Safety net.

    The tick loop below is driven by requestAnimationFrame, which browsers
    suspend outright while a tab is hidden — so a player who opens a case and
    switches tab has no frames, the loop never reaches its end, and `onSettled`
    never fires. The round is already settled on the server, but the interface
    would sit on "opening…" indefinitely.

    A timer covers that: `setTimeout` is throttled in the background but still
    fires, so the result resolves either way. Whichever gets there first wins,
    and `settledOnce` makes sure the callback runs exactly once per spin.
  */
  const settledOnce = useRef(false);

  useEffect(() => {
    if (!spinning) return;
    settledOnce.current = false;
  }, [spinning, winningIndex]);

  const settleOnce = useCallback(() => {
    if (settledOnce.current) return;
    settledOnce.current = true;
    onSettled?.();
  }, [onSettled]);

  useEffect(() => {
    if (!spinning || reducedMotion) return;
    const guard = setTimeout(settleOnce, SPIN_MS + 900);
    return () => clearTimeout(guard);
  }, [spinning, winningIndex, reducedMotion, settleOnce]);

  // Ticks follow the same easing curve as the strip, so they thin out as it slows.
  useEffect(() => {
    if (!spinning || reducedMotion) return;
    const startedAt = performance.now();
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      if (elapsed >= SPIN_MS) {
        sound("reelStop");
        settleOnce();
        return;
      }
      const progress = elapsed / SPIN_MS;
      const gap = 40 + progress * progress * 260;
      if (elapsed - last > gap) {
        last = elapsed;
        soundPitched("caseTick", progress);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, reducedMotion]);

  return (
    <div
      ref={viewport}
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--color-obsidian-950)_70%,transparent)]"
      style={{ height: CELL + 28 }}
    >
      {/* marker */}
      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px -translate-x-1/2"
        style={{ background: `linear-gradient(to bottom, transparent, ${accent}, transparent)` }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2"
        style={{ color: accent }}
        aria-hidden="true"
      >
        <Icon name="chevronDown" size={16} />
      </div>

      {/* edge fade */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(90deg, var(--color-obsidian-950) 0%, transparent 16%, transparent 84%, var(--color-obsidian-950) 100%)",
        }}
        aria-hidden="true"
      />

      <div
        className="flex h-full items-center"
        style={{
          gap: GAP,
          paddingLeft: 0,
          transform: `translate3d(${-offset}px, 0, 0)`,
          transition: animating
            ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.62, 0.08, 1)`
            : undefined,
        }}
      >
        {items.map((item, index) => {
          const meta = RARITY_META[item.rarity];
          const isWinner = index === winningIndex;
          return (
            <div
              key={`${item.id}-${index}`}
              className="relative flex shrink-0 flex-col items-center justify-center rounded-[12px]"
              style={{
                width: CELL,
                height: CELL,
                background: `linear-gradient(180deg, color-mix(in oklab, ${meta.color} 12%, transparent), var(--color-obsidian-850))`,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} ${isWinner ? 40 : 20}%, transparent)`,
              }}
            >
              <span style={{ color: meta.color }}>
                <Icon name={item.icon} size={34} />
              </span>
              <p className="mt-2 line-clamp-1 px-2 text-center text-[10px] font-semibold text-[var(--text-muted)]">
                {item.name}
              </p>
              <p className="tabular mt-0.5 text-[11px] font-semibold" style={{ color: meta.color }}>
                {formatCoins(item.value)}
              </p>
              <span
                className="absolute inset-x-0 bottom-0 h-[2px] rounded-b-[12px]"
                style={{ background: meta.color, opacity: 0.7 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
