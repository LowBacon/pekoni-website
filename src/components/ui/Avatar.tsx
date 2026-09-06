"use client";

import { useState } from "react";
import { mulberry32, seedFrom } from "@/components/env/scenes";

/**
 * Minecraft player head.
 *
 * Three sources, in order of how much the player chose them:
 *
 *   1. The public head service, when a Minecraft name is linked. That name is
 *      typed in deliberately, so it always wins.
 *   2. The portrait from a linked Google or Discord account, for players who
 *      signed up that way and have not named a character yet.
 *   3. A deterministic voxel portrait generated from the username.
 *
 * Every remote source can fail — offline, rate limited, unknown name — and each
 * failure falls through to the next, so the layout never collapses and nobody
 * sees a broken image.
 */

type Props = {
  username: string;
  minecraftUsername?: string | null;
  /** Portrait from a linked provider, used when no Minecraft name is set. */
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  /** Adds a subtle rim so heads read against busy artwork. */
  ring?: boolean;
};

const PALETTES = [
  ["#91b65d", "#5c7a3a"],
  ["#7fa9b5", "#4b6e78"],
  ["#e9af53", "#a97a2f"],
  ["#9b8ac8", "#665a8c"],
  ["#55c98b", "#347d57"],
  ["#d96962", "#8f4340"],
];

function VoxelPortrait({ name, size }: { name: string; size: number }) {
  const rand = mulberry32(seedFrom(name.toLowerCase()));
  const [light, dark] = PALETTES[Math.floor(rand() * PALETTES.length)];
  const cells = [];
  const grid = 8;

  // Mirrored across the vertical axis so the result reads as a face.
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid / 2; x += 1) {
      const filled = rand() > (y < 2 || y > 6 ? 0.62 : 0.36);
      if (!filled) continue;
      const shade = rand() > 0.62 ? light : dark;
      cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={shade} />);
      cells.push(
        <rect key={`m${x}-${y}`} x={grid - 1 - x} y={y} width={1} height={1} fill={shade} />,
      );
    }
  }

  return (
    <svg viewBox={`0 0 ${grid} ${grid}`} width={size} height={size} aria-hidden="true">
      <rect width={grid} height={grid} fill="#151c15" />
      {cells}
    </svg>
  );
}

export default function Avatar({
  username,
  minecraftUsername,
  avatarUrl,
  size = 40,
  className = "",
  ring = false,
}: Props) {
  const [failed, setFailed] = useState(false);
  const name = minecraftUsername || username;
  const pixels = Math.min(256, Math.max(32, Math.round(size * 2)));

  // Provider portraits are photographic; the pixelated rendering that suits a
  // 8x8 Minecraft head would wreck them.
  const usesProvider = !minecraftUsername && Boolean(avatarUrl);
  const source = usesProvider
    ? (avatarUrl as string)
    : `https://mc-heads.net/avatar/${encodeURIComponent(name)}/${pixels}`;

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden rounded-[6px] bg-[var(--color-obsidian-800)] ${
        ring ? "ring-1 ring-[var(--line-strong)]" : ""
      } ${className}`}
      style={{
        width: size,
        height: size,
        imageRendering: usesProvider ? "auto" : "pixelated",
        borderRadius: usesProvider ? "50%" : undefined,
      }}
    >
      {failed ? (
        <VoxelPortrait name={name} size={size} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="block h-full w-full object-cover"
          style={{ imageRendering: usesProvider ? "auto" : "pixelated" }}
        />
      )}
    </span>
  );
}
