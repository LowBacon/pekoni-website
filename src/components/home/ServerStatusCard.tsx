"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icons";
import { Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/providers/ToastProvider";
import { formatRelative } from "@/lib/format";

type Edition = {
  edition: string;
  address: string;
  online: boolean;
  playersOnline: number | null;
  playersMax: number | null;
  version: string | null;
  motd: string | null;
  error: string | null;
  fetchedAt: string;
};

type Status = {
  java: Edition;
  bedrock: Edition;
  online: boolean;
  playersOnline: number | null;
};

/**
 * Live Pekoni server card.
 *
 * The player count is whatever the query API returned, or nothing at all. When
 * the lookup fails the card says the connection failed rather than guessing —
 * there is no placeholder number anywhere in this component.
 */
export default function ServerStatusCard({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/server-status", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setStatus((await response.json()) as Status);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const copy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      toast.success("IP kopioitu", address);
      setTimeout(() => setCopied(null), 2_000);
    } catch {
      toast.error("Kopiointi ei onnistunut", "Kopioi osoite käsin.");
    }
  };

  if (failed && !status) {
    return (
      <div className="panel p-5" id="server">
        <p className="text-sm font-semibold text-[var(--text-dim)]">Yhteys epäonnistui.</p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">Palvelimeen ei saatu yhteyttä.</p>
        <button type="button" onClick={load} className="btn btn-ghost btn-sm mt-4">
          <Icon name="refresh" size={15} />
          Yritä uudelleen
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="panel space-y-3 p-5" id="server">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  const anyOnline = status.online;

  return (
    <div className="panel relative overflow-hidden p-5" id="server">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Pekoni Server</p>
          <div className="mt-2 flex items-center gap-2.5">
            <span
              className="size-2 rounded-full"
              style={{
                background: anyOnline ? "var(--color-emerald-400)" : "var(--color-danger-500)",
                boxShadow: anyOnline ? "0 0 12px var(--color-emerald-500)" : "none",
              }}
            />
            <span className="text-lg font-semibold">{anyOnline ? "Online" : "Offline"}</span>
          </div>
        </div>

        {anyOnline && status.playersOnline !== null && (
          <div className="text-right">
            <p className="tabular text-2xl font-semibold text-[var(--color-emerald-400)]">
              {status.playersOnline}
            </p>
            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-faint)]">
              pelaajaa
            </p>
          </div>
        )}
      </div>

      {status.java.motd && anyOnline && (
        <p className="mt-3 line-clamp-2 text-[13px] italic text-[var(--text-muted)]">
          {status.java.motd}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {[status.java, status.bedrock].map((edition) => (
          <div
            key={edition.edition}
            className="flex items-center gap-3 rounded-[10px] border border-[var(--line-soft)] bg-[var(--color-obsidian-900)] px-3 py-2.5"
          >
            <span className="w-16 shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-faint)]">
              {edition.edition === "JAVA" ? "Java" : "Bedrock"}
            </span>
            <code className="tabular min-w-0 flex-1 truncate text-[13px] text-[var(--text-dim)]">
              {edition.address}
            </code>
            <button
              type="button"
              onClick={() => copy(edition.address)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-faint)] transition-colors hover:bg-[color-mix(in_oklab,var(--color-frost-100)_7%,transparent)] hover:text-[var(--color-emerald-400)]"
              aria-label={`Kopioi ${edition.edition} IP`}
            >
              <Icon name={copied === edition.address ? "check" : "copy"} size={15} />
            </button>
          </div>
        ))}
      </div>

      {!compact && (
        <p className="mt-3 text-[11px] text-[var(--text-faint)]">
          {status.java.error
            ? `Java: ${status.java.error}.`
            : `Päivitetty ${formatRelative(status.java.fetchedAt)}.`}
        </p>
      )}
    </div>
  );
}
