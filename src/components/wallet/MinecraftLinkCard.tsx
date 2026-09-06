"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPost, useResource, ApiError } from "@/lib/client/api";
import { Icon } from "@/components/ui/Icons";
import { Pill, SectionHeader, Skeleton } from "@/components/ui/primitives";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/providers/ToastProvider";
import { formatCountdown, formatDateTime } from "@/lib/format";

/**
 * Minecraft account linking.
 *
 * The whole card exists to make one thing obvious: the code has to be typed
 * *in game*. That is the proof — the browser can claim any username, but only
 * the person holding the account can run a command as it. So the command is the
 * hero of the layout, the countdown is visible, and the code is one tap to copy.
 */

type LinkStatus = {
  linked: boolean;
  username: string | null;
  uuid: string | null;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  health: "ONLINE" | "RECENT" | "STALE" | "UNKNOWN";
};

type Payload = { status: LinkStatus; integrationReady: boolean };

const HEALTH: Record<LinkStatus["health"], { label: string; tone: "emerald" | "cyan" | "amber" | "neutral" }> = {
  ONLINE: { label: "Online juuri nyt", tone: "emerald" },
  RECENT: { label: "Nähty viimeisen vuorokauden aikana", tone: "cyan" },
  STALE: { label: "Ei nähty hetkeen", tone: "amber" },
  UNKNOWN: { label: "Ei vielä havaintoja", tone: "neutral" },
};

export default function MinecraftLinkCard({ onChange }: { onChange?: () => void }) {
  const { data, loading, reload } = useResource<Payload>("/api/minecraft/link");
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const toast = useToast();

  // While a code is live, poll for the plugin having consumed it, so the card
  // flips to "linked" on its own rather than making the player refresh.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    reload();
    onChange?.();
  }, [reload, onChange]);

  useEffect(() => {
    if (!code) return;

    const tick = () => {
      const left = new Date(code.expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, left));
      if (left <= 0) setCode(null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [code]);

  useEffect(() => {
    if (!code) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => void refresh(), 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [code, refresh]);

  // The moment the server says we are linked, stop the countdown.
  useEffect(() => {
    if (data?.status.linked && code) {
      setCode(null);
      toast.success("Minecraft-tili vahvistettu", data.status.username ?? undefined);
    }
  }, [data?.status.linked, data?.status.username, code, toast]);

  const issueCode = async () => {
    setBusy(true);
    try {
      const issued = await apiPost<{ code: string; expiresAt: string }>("/api/minecraft/link");
      setCode(issued);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Koodin luonti epäonnistui.");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm("Irrotetaanko Minecraft-tili? Voit liittää sen myöhemmin uudelleen.")) return;
    setBusy(true);
    try {
      await apiPost("/api/minecraft/unlink");
      await refresh();
      toast.success("Minecraft-tili irrotettu");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Irrottaminen epäonnistui.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <section className="panel p-6">
        <Skeleton className="h-40 rounded-[var(--radius-panel)]" />
      </section>
    );
  }

  const { status, integrationReady } = data;

  /* ---------------------------------------------------------------- linked */
  if (status.linked) {
    const health = HEALTH[status.health];
    return (
      <section className="panel panel-lit p-6" id="minecraft">
        <SectionHeader
          eyebrow="Minecraft"
          title="Liitetty tili"
          description="Coinit siirtyvät tälle hahmolle. Tunniste on UUID, joten nimenvaihto ei katkaise yhteyttä."
        />

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Avatar username={status.username ?? ""} minecraftUsername={status.username} size={56} ring />
          <div className="min-w-[180px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold">{status.username}</p>
              <Pill tone="emerald">
                <Icon name="check" size={11} />
                Vahvistettu
              </Pill>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--text-faint)]">
              <span
                aria-hidden="true"
                className="inline-block size-1.5 rounded-full"
                style={{
                  background:
                    status.health === "ONLINE"
                      ? "var(--color-emerald-400)"
                      : status.health === "RECENT"
                        ? "var(--color-cyan-400)"
                        : "var(--color-frost-600)",
                }}
              />
              {health.label}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={unlink}>
            Irrota
          </button>
        </div>

        <dl className="mt-5 grid gap-3 border-t border-[var(--line-soft)] pt-5 sm:grid-cols-2">
          <div>
            <dt className="eyebrow mb-1">UUID</dt>
            <dd className="break-all font-mono text-[11px] text-[var(--text-muted)]">{status.uuid}</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1">Vahvistettu</dt>
            <dd className="text-[12px] text-[var(--text-muted)]">
              {status.verifiedAt ? formatDateTime(status.verifiedAt) : "—"}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  /* ------------------------------------------------------- not yet linked */
  return (
    <section className="panel p-6" id="minecraft">
      <SectionHeader
        eyebrow="Minecraft"
        title="Liitä pelitilisi"
        description="Vahvistus tehdään pelin sisällä, joten kukaan muu ei voi liittää hahmoasi."
      />

      {!integrationReady ? (
        <div
          role="status"
          className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-amber-500)_28%,transparent)] bg-[color-mix(in_oklab,var(--color-amber-500)_7%,transparent)] px-4 py-3.5"
        >
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-[var(--color-amber-400)]" />
          <div>
            <p className="text-[13px] font-semibold text-[var(--color-amber-400)]">
              Palvelinyhteyttä ei ole vielä määritetty
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
              Liittäminen ja siirrot vaativat Pekoni-lisäosan Minecraft-palvelimelle. Ylläpito
              löytää ohjeet README-tiedostosta.
            </p>
          </div>
        </div>
      ) : code ? (
        <div className="mt-5">
          <ol className="space-y-3 text-[13px] leading-relaxed text-[var(--text-dim)]">
            <li className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-emerald-500)_18%,transparent)] text-[11px] font-bold text-[var(--color-emerald-400)]">
                1
              </span>
              Liity Minecraft-palvelimelle sillä hahmolla, jonka haluat liittää.
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-emerald-500)_18%,transparent)] text-[11px] font-bold text-[var(--color-emerald-400)]">
                2
              </span>
              Kirjoita chattiin tämä komento:
            </li>
          </ol>

          <div className="mt-4 rounded-[var(--radius-control)] border border-[var(--line-accent)] bg-[var(--color-obsidian-900)] p-4">
            <p className="eyebrow mb-2">Komento pelissä</p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="font-mono text-[clamp(1rem,4vw,1.35rem)] font-semibold tracking-[0.08em] text-[var(--color-emerald-300)]">
                /minebet link {code.code}
              </code>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(`/minebet link ${code.code}`)
                    .then(() => toast.success("Komento kopioitu"))
                    .catch(() => toast.error("Kopiointi ei onnistunut."));
                }}
              >
                <Icon name="copy" size={13} />
                Kopioi
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
              <Icon name="clock" size={13} />
              Koodi vanhenee <span className="tabular font-semibold">{formatCountdown(remaining)}</span>
              <span aria-live="polite" className="sr-only">
                Koodi vanhenee {Math.ceil(remaining / 1000)} sekunnin kuluttua.
              </span>
            </p>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={issueCode}>
              <Icon name="refresh" size={13} />
              Uusi koodi
            </button>
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-faint)]">
            Odotetaan vahvistusta palvelimelta. Tämä sivu päivittyy itsestään, kun komento on
            suoritettu — koodi toimii vain kerran.
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <p className="text-[13px] leading-relaxed text-[var(--text-muted)]">
            Saat kertakäyttöisen koodin, jonka kirjoitat palvelimen chattiin. Koodi on voimassa
            10 minuuttia eikä sitä voi käyttää uudelleen.
          </p>
          <button type="button" className="btn btn-primary mt-5" disabled={busy} onClick={issueCode}>
            {busy ? "Luodaan…" : "Luo liitoskoodi"}
            {!busy && <Icon name="arrowRight" size={15} className="btn-nudge" />}
          </button>
        </div>
      )}
    </section>
  );
}
