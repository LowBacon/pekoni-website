import type { ReactNode } from "react";
import Link from "next/link";
import { formatCoins, formatSignedCoins } from "@/lib/format";
import { RARITY_META, type Rarity } from "@/lib/enums";
import { Icon } from "./Icons";

/* -------------------------------------------------------------------------- */
/* Coins                                                                      */
/* -------------------------------------------------------------------------- */

export function CoinMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="var(--color-amber-500)" fillOpacity="0.16" />
      <circle cx="8" cy="8" r="6.4" stroke="var(--color-amber-400)" strokeWidth="1.1" fill="none" />
      <path
        d="M9.9 6.2a2.4 2.4 0 1 0 0 3.6"
        stroke="var(--color-amber-400)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Coins({
  amount,
  signed = false,
  size = "md",
  showMark = true,
  className = "",
}: {
  amount: number;
  signed?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  showMark?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: "text-[13px] gap-1",
    md: "text-sm gap-1.5",
    lg: "text-lg gap-2",
    xl: "text-3xl gap-2.5",
  } as const;
  const markSize = { sm: 12, md: 14, lg: 18, xl: 26 }[size];
  const tone =
    signed && amount > 0
      ? "text-[var(--color-emerald-400)]"
      : signed && amount < 0
        ? "text-[var(--color-danger-400)]"
        : "text-[var(--text)]";

  return (
    <span className={`tabular inline-flex items-center font-semibold ${sizes[size]} ${tone} ${className}`}>
      {showMark && <CoinMark size={markSize} />}
      {signed ? formatSignedCoins(amount) : formatCoins(amount)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Rarity                                                                     */
/* -------------------------------------------------------------------------- */

export function RarityChip({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  const meta = RARITY_META[rarity];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${className}`}
      style={{
        color: meta.color,
        background: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 26%, transparent)`,
      }}
    >
      {meta.label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <h2 className="font-serif-display text-2xl leading-tight text-[var(--text)] sm:text-[28px]">
          {title}
        </h2>
        {description && (
          <p className="text-pretty mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  accent = "var(--color-emerald-400)",
  icon,
  className = "",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel relative overflow-hidden px-4 py-3.5 ${className}`}>
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}44, transparent)` }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">
            {label}
          </p>
          <div className="tabular mt-1.5 text-xl font-semibold text-[var(--text)]">{value}</div>
          {detail && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p>}
        </div>
        {icon && (
          <span className="shrink-0 rounded-lg p-1.5" style={{ color: accent, background: `${accent}14` }}>
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon = "info",
  title,
  description,
  action,
  className = "",
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[var(--radius-panel)] border border-dashed border-[var(--line)] px-6 py-14 text-center ${className}`}
    >
      <span className="mb-3.5 flex size-11 items-center justify-center rounded-xl bg-[var(--color-obsidian-800)] text-[var(--text-faint)]">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-[15px] font-semibold text-[var(--text-dim)]">{title}</p>
      {description && (
        <p className="text-pretty mt-1.5 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Yhteys epäonnistui.",
  description = "Palvelimeen ei saatu yhteyttä.",
  onRetry,
  className = "",
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[var(--radius-panel)] border border-[color-mix(in_oklab,var(--color-danger-500)_26%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_5%,transparent)] px-6 py-12 text-center ${className}`}
    >
      <span className="mb-3.5 flex size-11 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--color-danger-500)_14%,transparent)] text-[var(--color-danger-400)]">
        <Icon name="warning" size={20} />
      </span>
      <p className="text-[15px] font-semibold text-[var(--text)]">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-ghost btn-sm mt-5">
          <Icon name="refresh" size={15} />
          Yritä uudelleen
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`panel space-y-3 p-4 ${className}`}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "emerald" | "amber" | "cyan" | "violet" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "text-[var(--text-muted)] bg-[color-mix(in_oklab,var(--color-frost-100)_6%,transparent)]",
    emerald: "text-[var(--color-emerald-400)] bg-[color-mix(in_oklab,var(--color-emerald-500)_13%,transparent)]",
    amber: "text-[var(--color-amber-400)] bg-[color-mix(in_oklab,var(--color-amber-500)_13%,transparent)]",
    cyan: "text-[var(--color-cyan-400)] bg-[color-mix(in_oklab,var(--color-cyan-500)_13%,transparent)]",
    violet: "text-[var(--color-violet-400)] bg-[color-mix(in_oklab,var(--color-violet-500)_13%,transparent)]",
    danger: "text-[var(--color-danger-400)] bg-[color-mix(in_oklab,var(--color-danger-500)_13%,transparent)]",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  accent = "var(--color-emerald-400)",
  className = "",
  label,
}: {
  value: number;
  accent?: string;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-[var(--color-obsidian-800)] ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease-decel)]"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}aa, ${accent})` }}
      />
    </div>
  );
}

/** The virtual-currency disclosure. Shown wherever coins can be spent. */
export function VirtualCurrencyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-[var(--text-faint)] ${className}`}>
      Kaikki Pekoni Coins -valuutta on virtuaalista eikä sillä ole rahallista arvoa. Coineja ei voi
      nostaa eikä vaihtaa oikeaan rahaan.
    </p>
  );
}

export function TileLink({
  href,
  children,
  className = "",
  glow = "var(--color-emerald-500)",
  prefetch,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  glow?: string;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={`tile group block ${className}`}
      style={{ ["--tile-glow" as string]: glow }}
    >
      {children}
    </Link>
  );
}
