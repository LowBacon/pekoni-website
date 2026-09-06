"use client";

import PekoniScene from "@/components/env/PekoniScene";
import type { SceneKey } from "@/components/env/scenes";
import { Icon } from "@/components/ui/Icons";
import { Coins, Eyebrow, Pill } from "@/components/ui/primitives";
import { RARITY_META, type Rarity } from "@/lib/enums";

export type CaseSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;
  theme: string;
  kind: string;
  opened: number;
  expectedValue: number;
  odds: { rarity: Rarity; chance: number }[];
  items: { id: string; name: string; rarity: string; icon: string; value: number; chance: number }[];
};

/** Each crate is dug out of a different part of the world. */
export const CASE_SCENE: Record<string, { scene: SceneKey; glow: string }> = {
  starter: { scene: "clearing", glow: "var(--color-emerald-500)" },
  miner: { scene: "mine", glow: "var(--color-amber-500)" },
  forest: { scene: "wilderness", glow: "var(--color-emerald-500)" },
  diamond: { scene: "cavern", glow: "var(--color-cyan-500)" },
  nether: { scene: "shrine", glow: "var(--color-danger-500)" },
  pekoni: { scene: "lodge", glow: "var(--color-amber-500)" },
  ancient: { scene: "ruins", glow: "var(--color-mint-500)" },
  legendary: { scene: "vault", glow: "var(--color-violet-500)" },
  daily: { scene: "clearing", glow: "var(--color-amber-500)" },
};

export function caseScene(theme: string) {
  return CASE_SCENE[theme] ?? CASE_SCENE.starter;
}

export default function CaseCard({
  entry,
  selected,
  onSelect,
}: {
  entry: CaseSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = caseScene(entry.theme);
  const best = [...entry.items].sort((a, b) => b.value - a.value)[0];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="tile group relative flex min-h-[268px] flex-col justify-end overflow-hidden p-5 text-left"
      style={{
        ["--tile-glow" as string]: theme.glow,
        borderColor: selected ? "var(--line-strong)" : undefined,
      }}
    >
      <div className="tile-art absolute inset-0">
        <PekoniScene scene={theme.scene} variant={`case-${entry.slug}`} className="h-full w-full" />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, var(--color-obsidian-950) 8%, color-mix(in oklab, var(--color-obsidian-950) 58%, transparent) 46%, transparent 78%)",
        }}
      />

      <div className="relative">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {entry.odds.slice(0, 3).map((odd) => (
            <span
              key={odd.rarity}
              className="tabular rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                color: RARITY_META[odd.rarity].color,
                background: `color-mix(in oklab, ${RARITY_META[odd.rarity].color} 12%, transparent)`,
              }}
            >
              {(odd.chance * 100).toFixed(odd.chance < 0.01 ? 2 : 1)} %
            </span>
          ))}
        </div>

        <h3 className="text-lg font-semibold tracking-[-0.015em]">{entry.name}</h3>
        <p className="text-pretty mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--text-muted)]">
          {entry.tagline}
        </p>

        {best && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--text-faint)]">
            <Icon name={best.icon} size={12} />
            Paras: {best.name}
          </p>
        )}

        <div className="mt-3.5 flex items-center justify-between">
          <Coins amount={entry.price} size="sm" />
          <span className="tile-cta inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-emerald-400)]">
            {selected ? "Valittu" : "Avaa"}
            <Icon name="arrowRight" size={14} className="btn-nudge" />
          </span>
        </div>
      </div>

      {entry.kind === "DAILY" && (
        <span className="absolute right-4 top-4">
          <Pill tone="amber">Ilmainen</Pill>
        </span>
      )}
      {selected && (
        <span className="absolute left-4 top-4">
          <Eyebrow className="text-[var(--color-emerald-400)]">Auki</Eyebrow>
        </span>
      )}
    </button>
  );
}
