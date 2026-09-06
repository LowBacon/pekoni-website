"use client";

import { formatDate } from "@/lib/format";
import { Icon } from "@/components/ui/Icons";
import { ProgressBar } from "@/components/ui/primitives";

type Achievement = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  progress: number;
  xpReward: number;
  coinReward: number;
  unlockedAt: string | null;
};

/**
 * A collectible Pekoni emblem. Locked badges stay legible rather than hidden —
 * knowing what is left to earn is half of what makes them worth earning.
 */
export default function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const unlocked = Boolean(achievement.unlockedAt);
  const ratio = Math.min(1, achievement.progress / Math.max(1, achievement.target));
  const accent = unlocked ? "var(--color-amber-400)" : "var(--text-faint)";

  return (
    <article
      className="panel relative overflow-hidden px-4 py-4 transition-colors"
      style={
        unlocked
          ? {
              borderColor: "color-mix(in oklab, var(--color-amber-500) 24%, transparent)",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--color-amber-500) 6%, transparent), transparent 60%), var(--panel)",
            }
          : undefined
      }
    >
      <div className="flex items-start gap-3.5">
        <span
          className="relative flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            color: accent,
            background: unlocked
              ? "color-mix(in oklab, var(--color-amber-500) 14%, transparent)"
              : "var(--color-obsidian-800)",
            boxShadow: unlocked
              ? "inset 0 0 0 1px color-mix(in oklab, var(--color-amber-500) 30%, transparent)"
              : "inset 0 0 0 1px var(--line-soft)",
          }}
        >
          <Icon name={achievement.icon} size={20} />
          {!unlocked && (
            <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[var(--color-obsidian-850)] text-[var(--text-faint)]">
              <Icon name="lock" size={9} />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h3
            className={`truncate text-[14px] font-semibold ${
              unlocked ? "text-[var(--text)]" : "text-[var(--text-muted)]"
            }`}
          >
            {achievement.title}
          </h3>
          <p className="text-pretty mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            {achievement.description}
          </p>

          {unlocked ? (
            <p className="mt-2.5 text-[11px] text-[var(--color-amber-400)]">
              Avattu {achievement.unlockedAt ? formatDate(achievement.unlockedAt) : ""}
            </p>
          ) : (
            <div className="mt-3">
              <ProgressBar value={ratio} accent="var(--color-emerald-500)" label={achievement.title} />
              <p className="tabular mt-1.5 text-[11px] text-[var(--text-faint)]">
                {Math.min(achievement.progress, achievement.target).toLocaleString("fi-FI")} /{" "}
                {achievement.target.toLocaleString("fi-FI")}
                {achievement.coinReward > 0 && ` · +${achievement.coinReward.toLocaleString("fi-FI")} coins`}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
