"use client";

import { useMemo, useState } from "react";
import { formatCompact } from "@/lib/format";

type Point = { date: string; wagered: number; payout: number; rounds: number };

/**
 * Wagered against paid out, drawn in the same vocabulary as the rest of Pekoni:
 * an emerald line for what came in, cyan for what went out, the gap between them
 * shaded. No chart library — the shape is simple enough to draw honestly.
 */
export default function EconomyChart({
  series,
  className = "",
}: {
  series: Point[];
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const width = 720;
    const height = 200;
    const padding = { top: 12, right: 8, bottom: 22, left: 8 };
    const max = Math.max(1, ...series.flatMap((point) => [point.wagered, point.payout]));
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const step = series.length > 1 ? innerW / (series.length - 1) : innerW;

    const toPoint = (value: number, index: number) => ({
      x: padding.left + index * step,
      y: padding.top + innerH - (value / max) * innerH,
    });

    const line = (key: "wagered" | "payout") =>
      series
        .map((point, index) => {
          const { x, y } = toPoint(point[key], index);
          return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

    const area =
      series.length > 0
        ? `${line("wagered")} ` +
          series
            .slice()
            .reverse()
            .map((point, index) => {
              const { x, y } = toPoint(point.payout, series.length - 1 - index);
              return `L${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ") +
          " Z"
        : "";

    return { width, height, padding, max, step, innerH, toPoint, line, area };
  }, [series]);

  if (series.length === 0) {
    return (
      <p className={`text-sm text-[var(--text-muted)] ${className}`}>
        Ei dataa tältä aikaväliltä.
      </p>
    );
  }

  const active = hover !== null ? series[hover] : null;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-muted)]">
        <Legend color="var(--color-emerald-400)" label="Panostettu" />
        <Legend color="var(--color-cyan-400)" label="Maksettu" />
        {active && (
          <span className="tabular ml-auto text-[var(--text-dim)]">
            {active.date} · {formatCompact(active.wagered)} / {formatCompact(active.payout)} ·{" "}
            {active.rounds} kierrosta
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        className="mt-3 h-[200px] w-full"
        role="img"
        aria-label="Panostetut ja maksetut coinit päivittäin"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pekoni-economy-gap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-emerald-500)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-emerald-500)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1={geometry.padding.left}
            x2={geometry.width - geometry.padding.right}
            y1={geometry.padding.top + geometry.innerH * (1 - ratio)}
            y2={geometry.padding.top + geometry.innerH * (1 - ratio)}
            stroke="var(--line-soft)"
            strokeWidth="1"
          />
        ))}

        <path d={geometry.area} fill="url(#pekoni-economy-gap)" />
        <path d={geometry.line("wagered")} fill="none" stroke="var(--color-emerald-400)" strokeWidth="2" />
        <path d={geometry.line("payout")} fill="none" stroke="var(--color-cyan-400)" strokeWidth="2" />

        {series.map((point, index) => {
          const { x } = geometry.toPoint(point.wagered, index);
          return (
            <rect
              key={point.date}
              x={x - geometry.step / 2}
              y={0}
              width={Math.max(geometry.step, 6)}
              height={geometry.height}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          );
        })}

        {active && hover !== null && (
          <g>
            <line
              x1={geometry.toPoint(active.wagered, hover).x}
              x2={geometry.toPoint(active.wagered, hover).x}
              y1={geometry.padding.top}
              y2={geometry.padding.top + geometry.innerH}
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            <circle
              cx={geometry.toPoint(active.wagered, hover).x}
              cy={geometry.toPoint(active.wagered, hover).y}
              r="3.5"
              fill="var(--color-emerald-400)"
            />
            <circle
              cx={geometry.toPoint(active.payout, hover).x}
              cy={geometry.toPoint(active.payout, hover).y}
              r="3.5"
              fill="var(--color-cyan-400)"
            />
          </g>
        )}
      </svg>

      <div className="tabular flex justify-between text-[10px] text-[var(--text-faint)]">
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
