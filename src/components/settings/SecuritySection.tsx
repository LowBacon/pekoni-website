"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiPatch, apiPost, useResource, ApiError } from "@/lib/client/api";
import { IS_STATIC } from "@/lib/static/config";
import { Icon } from "@/components/ui/Icons";
import { Pill, SectionHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/providers/ToastProvider";
import { formatCoins, formatDateTime, formatRelative } from "@/lib/format";

/**
 * Security and self-control settings: active sessions, password, play limits,
 * and deletion.
 *
 * Grouped together because they answer one question — "what can happen to my
 * account, and how do I stop it?" — and because a player who has come looking
 * for one of them is usually looking for the neighbours too.
 */

type SessionRow = {
  id: string;
  device: string;
  browser: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
};

type Limits = {
  dailyWagerCap: number | null;
  maxBet: number | null;
  breakUntil: string | null;
  pendingCap: number | null;
  pendingCapAt: string | null;
  wageredToday: number;
  remainingToday: number | null;
};

export default function SecuritySection({ hasPassword }: { hasPassword: boolean }) {
  if (IS_STATIC) return null;
  return (
    <>
      <SessionsCard />
      <LimitsCard />
      <PasswordCard hasPassword={hasPassword} />
      <DangerCard />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function SessionsCard() {
  const { data, loading, setData } = useResource<{ sessions: SessionRow[] }>("/api/me/sessions");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const revoke = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const response = await apiFetch<{ sessions: SessionRow[] }>("/api/me/sessions", {
        method: "DELETE",
        body: JSON.stringify(body),
      });
      setData({ sessions: response.sessions });
      toast.success(message);
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Toiminto epäonnistui.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <section className="panel p-6">
        <Skeleton className="h-32 rounded-[var(--radius-panel)]" />
      </section>
    );
  }

  const others = data.sessions.filter((s) => !s.current).length;

  return (
    <section className="panel p-6" id="sessions">
      <SectionHeader
        eyebrow="Turvallisuus"
        title="Aktiiviset istunnot"
        description="Jokainen laite, jolla olet kirjautuneena. Emme tallenna IP-osoitteita."
      />

      <ul className="mt-6 space-y-2">
        {data.sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--line-soft)] px-4 py-3"
          >
            <Icon
              name={session.device.includes("iPhone") || session.device.includes("Android") ? "user" : "server"}
              size={16}
              className="shrink-0 text-[var(--text-faint)]"
            />
            <div className="min-w-[150px] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-[var(--text-dim)]">
                  {session.device} · {session.browser}
                </p>
                {session.current && <Pill tone="emerald">Tämä laite</Pill>}
              </div>
              <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                Viimeksi {formatRelative(session.lastUsedAt)}
              </p>
            </div>
            {!session.current && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => void revoke({ sessionId: session.id }, "Istunto suljettu")}
              >
                Sulje
              </button>
            )}
          </li>
        ))}
      </ul>

      {others > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-4"
          disabled={busy}
          onClick={() =>
            void revoke({ all: true, keepCurrent: true }, `${others} istuntoa suljettu`)
          }
        >
          <Icon name="logout" size={14} />
          Kirjaa ulos muilta laitteilta ({others})
        </button>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function LimitsCard() {
  const { data, loading, setData } = useResource<{ limits: Limits }>("/api/me/limits");
  const [maxBet, setMaxBet] = useState("");
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async (body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      const response = await apiPatch<{ limits: Limits }>("/api/me/limits", body);
      setData({ limits: response.limits });
      toast.success(message);
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Tallennus epäonnistui.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !data) {
    return (
      <section className="panel p-6">
        <Skeleton className="h-32 rounded-[var(--radius-panel)]" />
      </section>
    );
  }

  const limits = data.limits;
  const onBreak = limits.breakUntil && new Date(limits.breakUntil) > new Date();

  return (
    <section className="panel p-6" id="limits">
      <SectionHeader
        eyebrow="Pelirajat"
        title="Omat rajasi"
        description="Rajan kiristys astuu voimaan heti. Löysentäminen vasta vuorokauden kuluttua — silloin päätöksen ehtii harkita rauhassa."
      />

      {onBreak && (
        <p
          role="status"
          className="mt-5 rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-amber-500)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-amber-500)_8%,transparent)] px-4 py-3 text-[13px] text-[var(--color-amber-400)]"
        >
          Taukosi on voimassa {formatDateTime(limits.breakUntil!)} asti. Pelit eivät käynnisty
          ennen sitä.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="max-bet" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
            Suurin yksittäinen panos
          </label>
          <div className="flex gap-2">
            <input
              id="max-bet"
              className="field"
              inputMode="numeric"
              placeholder={limits.maxBet ? String(limits.maxBet) : "Ei rajaa"}
              value={maxBet}
              onChange={(event) => setMaxBet(event.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy || !maxBet}
              onClick={() => void save({ maxBet: Number(maxBet) }, "Panosraja tallennettu")}
            >
              Aseta
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="daily-cap" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
            Vuorokauden panosraja
          </label>
          <div className="flex gap-2">
            <input
              id="daily-cap"
              className="field"
              inputMode="numeric"
              placeholder={limits.dailyWagerCap ? String(limits.dailyWagerCap) : "Ei rajaa"}
              value={cap}
              onChange={(event) => setCap(event.target.value.replace(/[^\d]/g, ""))}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy || !cap}
              onClick={() => void save({ dailyWagerCap: Number(cap) }, "Vuorokausiraja tallennettu")}
            >
              Aseta
            </button>
          </div>
          <p className="mt-1.5 text-[12px] text-[var(--text-faint)]">
            Panostettu tänään: <span className="tabular">{formatCoins(limits.wageredToday)}</span>
            {limits.remainingToday !== null && (
              <> · jäljellä <span className="tabular">{formatCoins(limits.remainingToday)}</span></>
            )}
          </p>
        </div>
      </div>

      {limits.pendingCap !== null && limits.pendingCapAt && (
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-amber-400)]">
          Korotus arvoon {formatCoins(limits.pendingCap)} astuu voimaan{" "}
          {formatDateTime(limits.pendingCapAt)}. Siihen asti nykyinen raja on voimassa.
        </p>
      )}

      <div className="rule my-5" />

      <p className="text-[13px] font-semibold text-[var(--text-dim)]">Pidä tauko</p>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
        Pelit eivät käynnisty tauon aikana. Taukoa ei voi lyhentää sen alettua.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          { hours: 24, label: "24 tuntia" },
          { hours: 24 * 7, label: "Viikko" },
          { hours: 24 * 30, label: "Kuukausi" },
        ].map((option) => (
          <button
            key={option.hours}
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Aloitetaanko ${option.label.toLowerCase()} tauko? Sitä ei voi peruuttaa.`)) return;
              void save({ breakHours: option.hours }, "Tauko alkoi");
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Checked against the same rules the server enforces, so the form never
  // promises something the submit will refuse.
  const check = async (value: string) => {
    setNext(value);
    if (!value) return setProblems([]);
    try {
      const response = await apiFetch<{ problems: string[] }>("/api/me/password", {
        method: "PUT",
        body: JSON.stringify({ password: value }),
      });
      setProblems(response.problems);
    } catch {
      /* the submit will validate anyway */
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await apiPost("/api/me/password", {
        currentPassword: hasPassword ? current : null,
        newPassword: next,
      });
      setCurrent("");
      setNext("");
      setProblems([]);
      toast.success("Salasana tallennettu", "Muut istunnot kirjattiin ulos.");
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Tallennus epäonnistui.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-6" id="security">
      <SectionHeader
        eyebrow="Salasana"
        title={hasPassword ? "Vaihda salasana" : "Aseta salasana"}
        description={
          hasPassword
            ? "Vaihto kirjaa ulos kaikki muut laitteet."
            : "Tilisi kirjautuu nyt vain liitetyllä palvelulla. Salasana antaa toisen tavan päästä sisään."
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {hasPassword && (
          <div>
            <label htmlFor="pw-current" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
              Nykyinen salasana
            </label>
            <input
              id="pw-current"
              type="password"
              className="field"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>
        )}
        <div className={hasPassword ? undefined : "sm:col-span-2"}>
          <label htmlFor="pw-new" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
            Uusi salasana
          </label>
          <input
            id="pw-new"
            type="password"
            className="field"
            autoComplete="new-password"
            aria-invalid={problems.length > 0 ? "true" : undefined}
            aria-describedby="pw-problems"
            value={next}
            onChange={(event) => void check(event.target.value)}
          />
        </div>
      </div>

      <ul id="pw-problems" className="mt-3 space-y-1" aria-live="polite">
        {problems.map((problem) => (
          <li key={problem} className="flex items-center gap-1.5 text-[12px] text-[var(--color-amber-400)]">
            <Icon name="warning" size={12} />
            {problem}
          </li>
        ))}
        {next && problems.length === 0 && (
          <li className="flex items-center gap-1.5 text-[12px] text-[var(--color-emerald-400)]">
            <Icon name="check" size={12} />
            Salasana kelpaa.
          </li>
        )}
      </ul>

      <button
        type="button"
        className="btn btn-primary btn-sm mt-5"
        disabled={busy || !next || problems.length > 0 || (hasPassword && !current)}
        onClick={submit}
      >
        {busy ? "Tallennetaan…" : "Tallenna salasana"}
      </button>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function DangerCard() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const remove = async () => {
    setBusy(true);
    try {
      await apiPost("/api/me/delete", { confirmation });
      router.push("/");
      router.refresh();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Poisto epäonnistui.");
      setBusy(false);
    }
  };

  return (
    <section
      className="panel p-6"
      id="delete"
      style={{ borderColor: "color-mix(in oklab, var(--color-danger-500) 24%, transparent)" }}
    >
      <SectionHeader
        eyebrow="Tilin poisto"
        title="Poista tili pysyvästi"
        description="Saldo, pelihistoria, liitokset ja saavutukset poistetaan. Tätä ei voi peruuttaa."
      />

      {!open ? (
        <button type="button" className="btn btn-danger btn-sm mt-5" onClick={() => setOpen(true)}>
          Poista tilini
        </button>
      ) : (
        <div className="mt-5">
          <label htmlFor="delete-confirm" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
            Kirjoita käyttäjänimesi vahvistaaksesi
          </label>
          <input
            id="delete-confirm"
            className="field max-w-xs"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <p className="mt-2 text-[12px] text-[var(--text-faint)]">
            Jos sinulla on siirtoja kesken, odota ensin niiden valmistumista.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy || !confirmation}
              onClick={remove}
            >
              {busy ? "Poistetaan…" : "Poista lopullisesti"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setConfirmation("");
              }}
            >
              Peruuta
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
