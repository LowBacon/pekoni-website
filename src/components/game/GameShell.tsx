import type { ReactNode } from "react";
import Link from "next/link";
import PekoniScene from "@/components/env/PekoniScene";
import Atmosphere from "@/components/env/Atmosphere";
import type { SceneKey } from "@/components/env/scenes";
import { Icon } from "@/components/ui/Icons";
import { Eyebrow, VirtualCurrencyNote } from "@/components/ui/primitives";

/**
 * The frame every game sits in: its own environment, an editorial header, and a
 * full-width area the game lays out however it needs. The scene changes per
 * game, so no two rooms in Pekoni feel like the same room.
 */
export default function GameShell({
  scene,
  eyebrow,
  title,
  tagline,
  children,
  headerExtra,
  sceneIntensity = 0.85,
}: {
  scene: SceneKey;
  eyebrow: string;
  title: string;
  tagline: string;
  children: ReactNode;
  headerExtra?: ReactNode;
  sceneIntensity?: number;
}) {
  return (
    <div className="relative isolate min-h-[calc(100dvh-var(--topbar-h))]">
      <div className="env">
        <PekoniScene
          scene={scene}
          variant={title}
          className="h-full w-full"
          intensity={sceneIntensity}
        />
        <Atmosphere scene={scene} density={0.75} />
        <div className="env-fog" />
        <div className="grain" />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{
            background: "linear-gradient(to bottom, transparent, var(--color-obsidian-950) 88%)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1180px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/games-hub"
              className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
            >
              <Icon name="chevronLeft" size={14} />
              Pelit
            </Link>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="font-serif-display mt-2 text-[clamp(2.2rem,6vw,3.4rem)] leading-[0.95] tracking-[-0.025em]">
              {title}
            </h1>
            <p className="text-pretty mt-2.5 max-w-lg text-sm leading-relaxed text-[var(--text-muted)]">
              {tagline}
            </p>
          </div>
          {headerExtra}
        </div>

        {children}

        <VirtualCurrencyNote className="mt-8 max-w-2xl" />
      </div>
    </div>
  );
}

/** The two-column play layout most games use: surface left, controls right. */
export function GameLayout({
  surface,
  controls,
  below,
}: {
  surface: ReactNode;
  controls: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start lg:gap-5">
      <div className="min-w-0 space-y-4">{surface}</div>
      <div className="space-y-4 lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)]">{controls}</div>
      {below && <div className="lg:col-span-2">{below}</div>}
    </div>
  );
}
