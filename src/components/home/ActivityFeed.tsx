"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { Coins, EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatRelative } from "@/lib/format";
import { RARITY_META, type Rarity } from "@/lib/enums";

type FeedItem = {
  id: string;
  kind: string;
  username: string;
  minecraftUsername: string | null;
  label: string;
  amount: number | null;
  rarity: Rarity | null;
  createdAt: string;
};

const KIND_ACCENT: Record<string, string> = {
  GAME_WIN: "var(--color-emerald-400)",
  CASE_OPEN: "var(--color-amber-400)",
  BATTLE_WIN: "var(--color-violet-400)",
  LEVEL_UP: "var(--color-cyan-400)",
  ACHIEVEMENT: "var(--color-mint-400)",
};

/**
 * The public feed. Sanitised server-side — a line only ever carries a username,
 * a label and an amount. Balances and transactions never reach this component.
 */
export default function ActivityFeed({
  limit = 8,
  className = "",
}: {
  limit?: number;
  className?: string;
}) {
  const [items, setItems] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/activity?limit=${limit}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { feed: FeedItem[] };
        if (!cancelled) setItems(data.feed);
      } catch {
        if (!cancelled) setItems([]);
      }
    };
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [limit]);

  if (items === null) {
    return (
      <div className={`space-y-2.5 ${className}`}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-[6px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="spark"
        title="Hiljaista metsässä."
        description="Ensimmäiset voitot ilmestyvät tähän heti kun joku aloittaa pelaamisen."
        className={className}
      />
    );
  }

  return (
    <ul className={`space-y-0.5 ${className}`}>
      {items.map((item) => {
        const accent = KIND_ACCENT[item.kind] ?? "var(--color-emerald-400)";
        const rarityColor = item.rarity ? RARITY_META[item.rarity].color : null;
        return (
          <li
            key={item.id}
            className="rise flex items-center gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_3%,transparent)]"
          >
            <Avatar
              username={item.username}
              minecraftUsername={item.minecraftUsername}
              size={30}
              ring
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] leading-snug text-[var(--text-muted)]">
                <span className="font-semibold text-[var(--text-dim)]">{item.username}</span>{" "}
                {item.label}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-faint)]">
                {formatRelative(item.createdAt)}
              </p>
            </div>
            {item.amount !== null && item.amount > 0 && (
              <Coins
                amount={item.amount}
                size="sm"
                showMark={false}
                className="shrink-0"
              />
            )}
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: rarityColor ?? accent }}
              aria-hidden="true"
            />
          </li>
        );
      })}
    </ul>
  );
}
