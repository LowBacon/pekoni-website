import { SCENES, mulberry32, seedFrom, type SceneKey, type SceneSpec } from "./scenes";

/**
 * The cinematic backdrop. Pure SVG, rendered on the server, no images and no
 * client JavaScript — so it costs nothing at runtime and never causes layout
 * shift. Parallax and particle motion are layered on top by <SceneParallax />
 * where a page wants them.
 */

type Props = {
  scene: SceneKey;
  /** Changes the procedural layout without changing the palette. */
  variant?: string;
  className?: string;
  /** 0–1. Lower values sink the art further into the page. */
  intensity?: number;
  /** Adds the bottom-heavy vignette used by full-bleed heroes. */
  vignette?: boolean;
};

const W = 1600;
const H = 900;

function ridgePath(
  rand: () => number,
  baseY: number,
  amplitude: number,
  steps: number,
  blocky: boolean,
): string {
  const points: string[] = [`M -40 ${H + 40}`, `L -40 ${baseY}`];
  let x = -40;
  const stride = (W + 80) / steps;

  let y = baseY;
  for (let i = 0; i <= steps; i += 1) {
    const drift = (rand() - 0.5) * amplitude;
    const targetY = Math.max(40, baseY + drift - Math.sin((i / steps) * Math.PI) * amplitude * 0.5);
    if (blocky) {
      // Cubic ridgelines — the voxel signature, without copying any tileset.
      points.push(`L ${x.toFixed(1)} ${targetY.toFixed(1)}`);
      x += stride;
      points.push(`L ${x.toFixed(1)} ${targetY.toFixed(1)}`);
    } else {
      x += stride;
      const midX = x - stride / 2;
      points.push(`Q ${midX.toFixed(1)} ${((y + targetY) / 2).toFixed(1)} ${x.toFixed(1)} ${targetY.toFixed(1)}`);
    }
    y = targetY;
  }

  points.push(`L ${W + 40} ${H + 40}`, "Z");
  return points.join(" ");
}

function pine(x: number, baseY: number, height: number, width: number): string {
  const tiers = 4;
  const parts: string[] = [];
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const tierWidth = width * (1 - t * 0.62);
    const tierTop = baseY - height * (0.34 + t * 0.62);
    const tierBottom = baseY - height * (t * 0.62) * 0.92;
    parts.push(
      `M ${(x - tierWidth).toFixed(1)} ${tierBottom.toFixed(1)} L ${x.toFixed(1)} ${tierTop.toFixed(1)} L ${(x + tierWidth).toFixed(1)} ${tierBottom.toFixed(1)} Z`,
    );
  }
  parts.push(
    `M ${(x - width * 0.09).toFixed(1)} ${baseY.toFixed(1)} L ${(x - width * 0.09).toFixed(1)} ${(baseY - height * 0.2).toFixed(1)} L ${(x + width * 0.09).toFixed(1)} ${(baseY - height * 0.2).toFixed(1)} L ${(x + width * 0.09).toFixed(1)} ${baseY.toFixed(1)} Z`,
  );
  return parts.join(" ");
}

function Motif({ spec, rand, id }: { spec: SceneSpec; rand: () => number; id: string }) {
  const baseY = H * spec.horizon;

  if (spec.motif === "pines") {
    const count = Math.round(26 * spec.motifDensity);
    const paths: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const x = -60 + rand() * (W + 120);
      const scale = 0.55 + rand() * 0.85;
      paths.push(pine(x, baseY + 30 + rand() * 60, 190 * scale, 46 * scale));
    }
    return <path d={paths.join(" ")} fill={`url(#${id}-mid)`} />;
  }

  if (spec.motif === "voxels") {
    const count = Math.round(22 * spec.motifDensity);
    const rects = [];
    for (let i = 0; i < count; i += 1) {
      const size = 26 + rand() * 84;
      const x = rand() * W;
      const y = baseY - size - rand() * 200;
      rects.push(
        <rect
          key={i}
          x={x.toFixed(1)}
          y={y.toFixed(1)}
          width={size.toFixed(1)}
          height={size.toFixed(1)}
          rx={2}
          fill={`url(#${id}-mid)`}
          opacity={0.5 + rand() * 0.5}
        />,
      );
    }
    return <g>{rects}</g>;
  }

  if (spec.motif === "columns") {
    const count = Math.round(11 * spec.motifDensity);
    const shapes = [];
    for (let i = 0; i < count; i += 1) {
      const x = 40 + (i / count) * (W - 80) + (rand() - 0.5) * 60;
      const width = 34 + rand() * 40;
      const height = 150 + rand() * 300;
      const broken = rand() > 0.55;
      shapes.push(
        <g key={i} opacity={0.55 + rand() * 0.45}>
          <rect
            x={x.toFixed(1)}
            y={(baseY - height).toFixed(1)}
            width={width.toFixed(1)}
            height={height.toFixed(1)}
            fill={`url(#${id}-mid)`}
          />
          {!broken && (
            <rect
              x={(x - width * 0.22).toFixed(1)}
              y={(baseY - height - 20).toFixed(1)}
              width={(width * 1.44).toFixed(1)}
              height={20}
              fill={`url(#${id}-mid)`}
            />
          )}
        </g>,
      );
    }
    return <g>{shapes}</g>;
  }

  if (spec.motif === "arches") {
    const count = Math.round(6 * spec.motifDensity) + 2;
    const shapes = [];
    for (let i = 0; i < count; i += 1) {
      const width = 150 + rand() * 210;
      const x = -80 + (i / count) * (W + 160);
      const height = 220 + rand() * 240;
      shapes.push(
        <path
          key={i}
          d={`M ${x} ${baseY} L ${x} ${baseY - height * 0.62} Q ${x + width / 2} ${baseY - height} ${x + width} ${baseY - height * 0.62} L ${x + width} ${baseY} L ${x + width - 26} ${baseY} L ${x + width - 26} ${baseY - height * 0.58} Q ${x + width / 2} ${baseY - height * 0.9} ${x + 26} ${baseY - height * 0.58} L ${x + 26} ${baseY} Z`}
          fill={`url(#${id}-mid)`}
          opacity={0.5 + rand() * 0.5}
        />,
      );
    }
    return <g>{shapes}</g>;
  }

  if (spec.motif === "crystals") {
    const count = Math.round(20 * spec.motifDensity);
    const shapes = [];
    for (let i = 0; i < count; i += 1) {
      const x = rand() * W;
      const height = 70 + rand() * 260;
      const width = 16 + rand() * 44;
      const lean = (rand() - 0.5) * 40;
      shapes.push(
        <path
          key={i}
          d={`M ${x} ${baseY + 20} L ${x - width / 2} ${baseY - height * 0.34} L ${x + lean} ${baseY - height} L ${x + width / 2} ${baseY - height * 0.3} Z`}
          fill={`url(#${id}-crystal)`}
          opacity={0.35 + rand() * 0.55}
        />,
      );
    }
    return <g>{shapes}</g>;
  }

  return null;
}

export default function PekoniScene({
  scene,
  variant = "",
  className = "",
  intensity = 1,
  vignette = true,
}: Props) {
  const spec = SCENES[scene];
  const id = `sc-${scene}-${variant || "base"}`.replace(/[^a-z0-9-]/gi, "");
  const rand = mulberry32(seedFrom(`${scene}:${variant}`));
  const baseY = H * spec.horizon;
  const { palette } = spec;

  const lightX = spec.lightX * W;
  const lightY = spec.lightY * H;

  // Light shafts fan out from the key light through the fog.
  const shafts = Array.from({ length: spec.shafts }, (_, i) => {
    const spread = 90 + i * 64;
    const offset = (i - (spec.shafts - 1) / 2) * 130 + (rand() - 0.5) * 60;
    return (
      <path
        key={i}
        d={`M ${lightX + offset * 0.2} ${lightY} L ${lightX + offset - spread} ${H + 60} L ${lightX + offset + spread} ${H + 60} Z`}
        fill={`url(#${id}-shaft)`}
        opacity={0.42 - i * 0.05}
      />
    );
  });

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      style={{ opacity: intensity }}
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sky[0]} />
          <stop offset="58%" stopColor={palette.sky[1]} />
          <stop offset="100%" stopColor={palette.sky[2]} />
        </linearGradient>

        <radialGradient id={`${id}-light`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.light} stopOpacity="0.34" />
          <stop offset="45%" stopColor={palette.light} stopOpacity="0.1" />
          <stop offset="100%" stopColor={palette.light} stopOpacity="0" />
        </radialGradient>

        <linearGradient id={`${id}-shaft`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.light} stopOpacity="0.16" />
          <stop offset="100%" stopColor={palette.light} stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${id}-far`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.ridges[0]} />
          <stop offset="100%" stopColor={palette.ridges[1]} />
        </linearGradient>

        <linearGradient id={`${id}-mid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.ridges[1]} />
          <stop offset="100%" stopColor={palette.ridges[2]} />
        </linearGradient>

        <linearGradient id={`${id}-crystal`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={palette.ridges[1]} />
          <stop offset="100%" stopColor={palette.accent} stopOpacity="0.5" />
        </linearGradient>

        <linearGradient id={`${id}-fog`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.fog} stopOpacity="0" />
          <stop offset="55%" stopColor={palette.fog} stopOpacity="0.075" />
          <stop offset="100%" stopColor={palette.fog} stopOpacity="0" />
        </linearGradient>

        <radialGradient id={`${id}-vig`} cx="50%" cy="34%" r="78%">
          <stop offset="40%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#040705" stopOpacity="0.92" />
        </radialGradient>
      </defs>

      {/* Sky */}
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />

      {/* Key light */}
      <circle cx={lightX} cy={lightY} r={H * 0.62} fill={`url(#${id}-light)`} />

      {/* Aurora band — a slow horizontal wash above the horizon */}
      <path
        d={`M -40 ${baseY - 300} Q ${W * 0.3} ${baseY - 400} ${W * 0.62} ${baseY - 300} T ${W + 40} ${baseY - 330} L ${W + 40} ${baseY - 180} Q ${W * 0.6} ${baseY - 250} -40 ${baseY - 160} Z`}
        fill={palette.accent}
        opacity={0.05}
      />

      {shafts}

      {/* Far ridge */}
      <path d={ridgePath(rand, baseY - 150, 190, 9, false)} fill={`url(#${id}-far)`} opacity={0.85} />

      {/* Fog band over the far ridge */}
      <rect x="0" y={baseY - 250} width={W} height={260} fill={`url(#${id}-fog)`} />

      {/* Mid ridge — blocky, the voxel signature of the world */}
      <path d={ridgePath(rand, baseY - 60, 120, 14, true)} fill={`url(#${id}-mid)`} opacity={0.94} />

      <Motif spec={spec} rand={rand} id={id} />

      {/* Low fog */}
      <rect x="0" y={baseY - 90} width={W} height={220} fill={`url(#${id}-fog)`} />

      {/* Foreground */}
      <path d={ridgePath(rand, baseY + 150, 90, 7, false)} fill={palette.fore} />

      {vignette && <rect width={W} height={H} fill={`url(#${id}-vig)`} />}
    </svg>
  );
}
