import Link from "next/link";

/**
 * PEKONI / MineBet lockup. The serif wordmark carries the world; the geometric
 * sans underneath names the platform.
 */
export default function Wordmark({
  href = "/",
  compact = false,
  size = "md",
  className = "",
}: {
  href?: string | null;
  compact?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const scale = {
    sm: { mark: 22, title: "text-[15px]", sub: "text-[9px]" },
    md: { mark: 28, title: "text-lg", sub: "text-[10px]" },
    lg: { mark: 40, title: "text-2xl", sub: "text-[11px]" },
  }[size];

  const content = (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="relative shrink-0" style={{ width: scale.mark, height: scale.mark }}>
        <svg viewBox="0 0 32 32" width={scale.mark} height={scale.mark} aria-hidden="true">
          <defs>
            <linearGradient id="pekoni-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-emerald-300)" />
              <stop offset="100%" stopColor="var(--color-emerald-600)" />
            </linearGradient>
          </defs>
          {/* Voxel cube — the world seen from above */}
          <path d="M16 2.5 29 10v12L16 29.5 3 22V10z" fill="var(--color-obsidian-800)" stroke="url(#pekoni-mark)" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M16 2.5 29 10 16 17.5 3 10z" fill="url(#pekoni-mark)" fillOpacity="0.28" />
          <path d="M16 17.5v12" stroke="url(#pekoni-mark)" strokeWidth="1.2" opacity="0.7" />
          <path d="M11 12.5 16 15.5l5-3" stroke="var(--color-emerald-300)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </span>
      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className={`font-serif-display ${scale.title} tracking-[0.02em] text-[var(--text)]`}>
            PEKONI
          </span>
          <span
            className={`mt-1 font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)] ${scale.sub}`}
          >
            MineBet
          </span>
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="rounded-lg outline-offset-4" aria-label="Pekoni — etusivu">
      {content}
    </Link>
  );
}
