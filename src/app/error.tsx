"use client";

import { useEffect } from "react";
import Link from "next/link";
import PekoniScene from "@/components/env/PekoniScene";
import { Icon } from "@/components/ui/Icons";
import { Eyebrow } from "@/components/ui/primitives";

/**
 * Route-level error boundary.
 *
 * A server exception reaches the browser as an opaque digest — the message
 * itself stays on the server, which is correct. So this screen shows the digest
 * (the one thing that ties the page to a log line) and says where to look,
 * rather than leaving the visitor with Next.js's unstyled default.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[pekoni] render error:", error);
  }, [error]);

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-clip px-5 py-12">
      <div className="env">
        <PekoniScene scene="ruins" variant="error" className="h-full w-full" intensity={0.7} />
        <div className="env-fog" />
        <div className="grain" />
      </div>

      <div className="panel-raised relative z-10 w-full max-w-lg p-7 sm:p-9">
        <span className="flex size-11 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--color-danger-500)_14%,transparent)] text-[var(--color-danger-400)]">
          <Icon name="warning" size={20} />
        </span>

        <Eyebrow className="mt-5">Polku katkesi</Eyebrow>
        <h1 className="font-serif-display mt-2.5 text-3xl leading-tight">Jokin meni pieleen.</h1>
        <p className="text-pretty mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
          Sivun lataus keskeytyi. Yritä uudelleen — jos virhe toistuu, tarkista palvelimen loki.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-[10px] border border-[var(--line-soft)] bg-[var(--color-obsidian-900)] px-3 py-2 font-mono text-[11px] text-[var(--text-faint)]">
            digest: {error.digest}
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            <Icon name="refresh" size={15} />
            Yritä uudelleen
          </button>
          <Link href="/" className="btn btn-ghost">
            Etusivulle
          </Link>
        </div>
      </div>
    </div>
  );
}
