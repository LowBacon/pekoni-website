import Link from "next/link";
import PekoniScene from "@/components/env/PekoniScene";
import type { SceneKey } from "@/components/env/scenes";
import { Icon } from "@/components/ui/Icons";
import { Eyebrow, Pill } from "@/components/ui/primitives";
import type { GameMeta } from "@/lib/games/config";

/** Each game's theme maps to its own location in the world. */
export const THEME_SCENE: Record<string, { scene: SceneKey; glow: string }> = {
  mine: { scene: "mine", glow: "var(--color-amber-500)" },
  altar: { scene: "altar", glow: "var(--color-violet-500)" },
  mountain: { scene: "mountain", glow: "var(--color-cyan-500)" },
  cavern: { scene: "cavern", glow: "var(--color-mint-500)" },
  ruins: { scene: "ruins", glow: "var(--color-emerald-500)" },
  shrine: { scene: "shrine", glow: "var(--color-amber-500)" },
  vault: { scene: "vault", glow: "var(--color-amber-500)" },
  arena: { scene: "arena", glow: "var(--color-violet-500)" },
};

export default function GameTile({
  game,
  size = "md",
}: {
  game: GameMeta;
  size?: "sm" | "md" | "lg";
}) {
  const theme = THEME_SCENE[game.theme] ?? THEME_SCENE.mine;
  const heights = {
    sm: "min-h-[184px]",
    md: "min-h-[228px]",
    lg: "min-h-[300px]",
  } as const;

  return (
    <Link
      href={game.href}
      className={`tile mb-sheen group relative flex flex-col justify-end overflow-hidden p-5 ${heights[size]}`}
      style={{ ["--tile-glow" as string]: theme.glow }}
    >
      <div className="tile-art absolute inset-0">
        <PekoniScene scene={theme.scene} variant={game.key} className="h-full w-full" />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, var(--color-obsidian-950) 6%, color-mix(in oklab, var(--color-obsidian-950) 60%, transparent) 44%, transparent 76%)",
        }}
      />

      <div className="relative">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {game.tags.slice(0, 2).map((tag) => (
            <Pill key={tag} tone={tag === "New" ? "amber" : "neutral"}>
              {tag}
            </Pill>
          ))}
        </div>
        <h3 className="text-lg font-semibold tracking-[-0.015em]">{game.name}</h3>
        <p className="text-pretty mt-1 line-clamp-2 text-[13px] leading-snug text-[var(--text-muted)]">
          {game.tagline}
        </p>

        <div className="mt-3.5 flex items-center justify-between">
          <span className="tile-cta inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-emerald-400)]">
            Pelaa
            <Icon name="arrowRight" size={14} className="btn-nudge" />
          </span>
          {game.minBet > 0 && (
            <span className="tabular text-[11px] text-[var(--text-faint)]">
              {game.minBet}–{game.maxBet.toLocaleString("fi-FI")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Wide hero variant used at the top of the MineBet landing page. */
export function FeaturedTile({ game }: { game: GameMeta }) {
  const theme = THEME_SCENE[game.theme] ?? THEME_SCENE.mine;

  return (
    <Link
      href={game.href}
      className="tile group relative flex min-h-[300px] flex-col justify-end overflow-hidden p-6 sm:min-h-[360px] sm:p-8"
      style={{ ["--tile-glow" as string]: theme.glow }}
    >
      <div className="tile-art absolute inset-0">
        <PekoniScene scene={theme.scene} variant={`featured-${game.key}`} className="h-full w-full" />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, var(--color-obsidian-950) 10%, color-mix(in oklab, var(--color-obsidian-950) 50%, transparent) 50%, transparent 80%)",
        }}
      />
      <div className="relative max-w-md">
        <Eyebrow>Suositeltu</Eyebrow>
        <h3 className="font-serif-display mt-2 text-3xl leading-tight sm:text-4xl">{game.name}</h3>
        <p className="text-pretty mt-2.5 text-sm leading-relaxed text-[var(--text-dim)]">
          {game.tagline}
        </p>
        <span className="btn btn-primary btn-sm mt-5 inline-flex">
          Pelaa nyt
          <Icon name="arrowRight" size={15} className="btn-nudge" />
        </span>
      </div>
    </Link>
  );
}
