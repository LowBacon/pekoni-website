"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost, idempotencyKey, useResource, ApiError } from "@/lib/client/api";
import { Icon } from "@/components/ui/Icons";
import { Coins, EmptyState, Pill, SectionHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/providers/ToastProvider";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { formatCoins, formatDateTime, formatRelative } from "@/lib/format";
import { TRANSFER_STATUS_META, type TransferStatus } from "@/lib/enums";

/**
 * Coin transfers to the game server.
 *
 * Three states, and the design leans on keeping them honestly distinct:
 *
 *   form → confirm → receipt
 *
 * The confirm step exists because a transfer is one-way and cannot be undone by
 * the player, so the amount, the destination and the direction are restated in
 * full before anything moves. The receipt shows the reference the player would
 * quote to support, and — importantly — shows PENDING as pending. A transfer is
 * only "done" when the game server says it is.
 */

type Transfer = {
  id: string;
  reference: string;
  amount: number;
  status: TransferStatus;
  direction: string;
  minecraftName: string;
  minecraftUuid: string;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
};

type Limits = {
  min: number;
  max: number;
  dailyCap: number;
  usedToday: number;
  remainingToday: number;
};

type Payload = {
  transfers: Transfer[];
  limits: Limits;
  link: { linked: boolean; username: string | null };
  balance: number;
  integrationReady: boolean;
};

type Stage = "form" | "confirm" | "receipt";

export default function TransferPanel() {
  const { data, loading, reload } = useResource<Payload>("/api/transfers", { pollMs: 15_000 });
  const [stage, setStage] = useState<Stage>("form");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<Transfer | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const { syncBalance } = usePlayer();
  const { sound } = usePreferences();

  /*
    One key per confirmed intent.

    Generated when the player reaches the confirm step and reused for every
    retry of that same transfer, so a double-click, a flaky connection or an
    impatient refresh all resolve to one debit. A new intent gets a new key.
  */
  const intentKey = useRef<string | null>(null);

  const parsed = Number.parseInt(amount.replace(/[^\d]/g, ""), 10);
  const value = Number.isFinite(parsed) ? parsed : 0;

  const ceiling = useMemo(() => {
    if (!data) return 0;
    return Math.min(data.balance, data.limits.max, data.limits.remainingToday);
  }, [data]);

  const problem = useMemo(() => {
    if (!data) return null;
    if (!data.link.linked) return "Liitä Minecraft-tilisi ensin.";
    if (!data.integrationReady) return "Siirrot eivät ole käytössä juuri nyt.";
    if (value <= 0) return null;
    if (value < data.limits.min) return `Pienin siirto on ${formatCoins(data.limits.min)} coinsia.`;
    if (value > data.balance) return "Saldosi ei riitä.";
    if (value > data.limits.max) return `Suurin yksittäinen siirto on ${formatCoins(data.limits.max)}.`;
    if (value > data.limits.remainingToday) {
      return `Vuorokausirajasta on jäljellä ${formatCoins(data.limits.remainingToday)}.`;
    }
    return null;
  }, [data, value]);

  const canSubmit = Boolean(data?.link.linked && data?.integrationReady && value > 0 && !problem);

  useEffect(() => {
    if (stage === "form") intentKey.current = null;
  }, [stage]);

  const confirm = async () => {
    if (!intentKey.current) intentKey.current = idempotencyKey();
    setPending(true);
    setError(null);
    try {
      const response = await apiPost<{ receipt: Transfer & { balanceAfter: number } }>(
        "/api/transfers",
        { amount: value, idempotencyKey: intentKey.current },
      );
      setReceipt(response.receipt);
      syncBalance(response.receipt.balanceAfter);
      setStage("receipt");
      sound("navigate");
      reload();
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : "Siirto epäonnistui.";
      setError(message);
      sound("error");
      // A refused transfer left no debit, so the same intent may be retried.
      if (cause instanceof ApiError && cause.status !== 409) intentKey.current = null;
    } finally {
      setPending(false);
    }
  };

  if (loading || !data) {
    return (
      <section className="panel p-6">
        <Skeleton className="h-56 rounded-[var(--radius-panel)]" />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="panel panel-lit p-6" id="transfer">
        <SectionHeader
          eyebrow="Siirto"
          title="Siirrä coineja palvelimelle"
          description="Yksisuuntainen: Pekoni-saldolta Minecraft-hahmollesi. Takaisinsiirtoa ei ole."
        />

        {stage === "form" && (
          <div className="mt-6">
            <label htmlFor="transfer-amount" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
              Summa
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="transfer-amount"
                className="field flex-1"
                inputMode="numeric"
                autoComplete="off"
                placeholder={String(data.limits.min)}
                value={amount}
                aria-invalid={problem ? "true" : undefined}
                aria-describedby="transfer-help"
                disabled={!data.link.linked || !data.integrationReady}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
              />
              <button
                type="button"
                className="btn btn-ghost"
                disabled={ceiling < data.limits.min}
                onClick={() => setAmount(String(Math.max(0, ceiling)))}
              >
                Maksimi
              </button>
            </div>

            <p id="transfer-help" className="mt-2 text-[12px] text-[var(--text-faint)]">
              {problem ? (
                <span className="text-[var(--color-danger-400)]">{problem}</span>
              ) : (
                <>
                  Käytettävissä <span className="tabular">{formatCoins(ceiling)}</span> · vuorokausiraja{" "}
                  <span className="tabular">
                    {formatCoins(data.limits.usedToday)}/{formatCoins(data.limits.dailyCap)}
                  </span>
                </>
              )}
            </p>

            <button
              type="button"
              className="btn btn-primary mt-5 w-full sm:w-auto"
              disabled={!canSubmit}
              onClick={() => {
                setError(null);
                setStage("confirm");
              }}
            >
              Jatka
              <Icon name="arrowRight" size={15} className="btn-nudge" />
            </button>
          </div>
        )}

        {stage === "confirm" && (
          <div className="mt-6">
            {/* Everything irreversible about this action, restated once. */}
            <dl className="divide-y divide-[var(--line-soft)] rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--color-obsidian-900)]">
              <Row label="Summa">
                <Coins amount={value} size="md" />
              </Row>
              <Row label="Vastaanottaja">
                <span className="font-semibold">{data.link.username}</span>
              </Row>
              <Row label="Suunta">
                <span className="flex items-center gap-1.5 text-[13px]">
                  Pekoni <Icon name="arrowRight" size={13} className="btn-nudge" /> Minecraft-palvelin
                </span>
              </Row>
              <Row label="Saldo siirron jälkeen">
                <span className="tabular text-[13px]">{formatCoins(data.balance - value)}</span>
              </Row>
            </dl>

            <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-faint)]">
              Coinit veloitetaan heti ja hyvitetään pelissä, kun palvelin vahvistaa siirron.
              Siirtoa ei voi peruuttaa. Jos palvelin ei vahvista sitä 30 minuutissa, coinit
              palautetaan saldollesi automaattisesti.
            </p>

            {error && (
              <p role="alert" className="mt-3 text-[13px] text-[var(--color-danger-400)]">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" data-busy={pending || undefined} disabled={pending} onClick={confirm}>
                {pending ? "Siirretään…" : `Vahvista siirto`}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pending}
                onClick={() => setStage("form")}
              >
                Takaisin
              </button>
            </div>
          </div>
        )}

        {stage === "receipt" && receipt && <Receipt receipt={receipt} onDone={() => {
          setStage("form");
          setAmount("");
          setReceipt(null);
        }} />}
      </section>

      <History transfers={data.transfers} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <dt className="text-[13px] text-[var(--text-muted)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The receipt.
 *
 * States what actually happened, which for a fresh transfer is "debited and
 * queued" — not "sent". Overstating this is the one thing a transfer UI must
 * never do, because the player will go and check in game.
 */
function Receipt({ receipt, onDone }: { receipt: Transfer; onDone: () => void }) {
  const meta = TRANSFER_STATUS_META[receipt.status] ?? TRANSFER_STATUS_META.PENDING;
  const toast = useToast();

  return (
    <div className="mt-6">
      <div className="rounded-[var(--radius-panel)] border border-[var(--line-accent)] bg-[var(--color-obsidian-900)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Kuitti</p>
            <p className="mt-1.5 font-mono text-[18px] font-semibold tracking-[0.06em] text-[var(--color-emerald-300)]">
              {receipt.reference}
            </p>
          </div>
          <Pill tone={meta.tone}>
            {meta.label}
          </Pill>
        </div>

        <dl className="mt-4 space-y-2.5 border-t border-[var(--line-soft)] pt-4">
          <ReceiptRow label="Summa" value={`${formatCoins(receipt.amount)} coins`} />
          <ReceiptRow label="Vastaanottaja" value={receipt.minecraftName} />
          <ReceiptRow label="Aika" value={formatDateTime(receipt.createdAt)} />
        </dl>

        <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-muted)]">{meta.description}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Valmis
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(receipt.reference)
              .then(() => toast.success("Viite kopioitu"))
              .catch(() => toast.error("Kopiointi ei onnistunut."));
          }}
        >
          <Icon name="copy" size={13} />
          Kopioi viite
        </button>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-[12px] text-[var(--text-faint)]">{label}</dt>
      <dd className="text-[13px] font-medium text-[var(--text-dim)]">{value}</dd>
    </div>
  );
}

function History({ transfers }: { transfers: Transfer[] }) {
  return (
    <section className="panel p-6">
      <SectionHeader eyebrow="Historia" title="Siirrot" />

      {transfers.length === 0 ? (
        <EmptyState
          className="mt-5"
          icon="wallet"
          title="Ei vielä siirtoja"
          description="Kun siirrät coineja palvelimelle, siirrot ja niiden kuitit näkyvät tässä."
        />
      ) : (
        <ul className="mt-5 space-y-2">
          {transfers.map((transfer) => {
            const meta = TRANSFER_STATUS_META[transfer.status] ?? TRANSFER_STATUS_META.PENDING;
            return (
              <li
                key={transfer.id}
                className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[var(--line-soft)] px-4 py-3"
              >
                <div className="min-w-[150px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-[var(--text-dim)]">
                      {transfer.reference}
                    </span>
                    <Pill tone={meta.tone}>
                      {meta.label}
                    </Pill>
                  </div>
                  <p className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                    {transfer.minecraftName} · {formatRelative(transfer.createdAt)}
                    {transfer.failureReason ? ` · ${transfer.failureReason}` : ""}
                  </p>
                </div>
                <span className="tabular text-[14px] font-semibold">
                  {formatCoins(transfer.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
