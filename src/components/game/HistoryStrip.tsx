"use client";

import { formatMultiplier } from "@/lib/format";

export type HistoryEntry = { id: string; multiplier: number; won: boolean; label?: string };

/**
 * Recent results. Newest enters from the left so the eye tracks one direction.
 */
export default function HistoryStrip({
  entries,
  emptyLabel = "Et ole vielä pelannut yhtään peliä.",
  className = "",
}: {
  entries: HistoryEntry[];
  emptyLabel?: string;
  className?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className={`px-1 text-[13px] text-[var(--text-faint)] ${className}`}>{emptyLabel}</p>
    );
  }

  return (
    <div className={`hide-scrollbar flex gap-1.5 overflow-x-auto ${className}`}>
      {entries.map((entry) => (
        <span
          key={entry.id}
          className="rise tabular shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-bold"
          style={{
            color: entry.won ? "var(--color-emerald-300)" : "var(--color-danger-400)",
            background: entry.won
              ? "color-mix(in oklab, var(--color-emerald-500) 13%, transparent)"
              : "color-mix(in oklab, var(--color-danger-500) 11%, transparent)",
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${
              entry.won ? "var(--color-emerald-500)" : "var(--color-danger-500)"
            } 22%, transparent)`,
          }}
        >
          {entry.label ?? formatMultiplier(entry.multiplier)}
        </span>
      ))}
    </div>
  );
}
