"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatCoins } from "@/lib/format";
import { Icon } from "@/components/ui/Icons";
import { CoinMark } from "@/components/ui/primitives";
import { usePlayer } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export const LARGE_WAGER_RATIO = 0.5;
const QUICK_BETS = [10, 50, 100, 500];

/**
 * Guard for unusually large wagers. Anything at or above half the balance asks
 * for a second, explicit confirmation before the request is sent.
 */
export function useWagerGuard() {
  const [request, setRequest] = useState<{
    bet: number;
    balance: number;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((bet: number, balance: number) => {
    if (balance <= 0 || bet / balance < LARGE_WAGER_RATIO) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setRequest({ bet, balance, resolve }));
  }, []);

  const settle = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };

  const dialog = request ? (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(4,7,5,0.72)] backdrop-blur-sm"
        onClick={() => settle(false)}
        aria-label="Peruuta"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="wager-title"
        className="panel-raised rise relative w-full max-w-sm p-6"
      >
        <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--color-amber-500)_15%,transparent)] text-[var(--color-amber-400)]">
          <Icon name="warning" size={20} />
        </span>
        <h2 id="wager-title" className="text-lg font-semibold">
          Panostat {Math.round((request.bet / request.balance) * 100)} % saldostasi. Jatketaanko?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          Panos {formatCoins(request.bet)} coins saldosta {formatCoins(request.balance)} coins.
        </p>
        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={() => settle(false)} className="btn btn-ghost flex-1">
            Peruuta
          </button>
          <button type="button" onClick={() => settle(true)} className="btn btn-amber flex-1">
            Jatka
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}

/* -------------------------------------------------------------------------- */

export default function BetPanel({
  value,
  onChange,
  min,
  max,
  disabled = false,
  label = "Panos",
  children,
  extra,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  label?: string;
  /** The primary action button(s). */
  children?: ReactNode;
  /** Extra controls rendered between the field and the action. */
  extra?: ReactNode;
}) {
  const { balance } = usePlayer();
  const { sound } = usePreferences();
  const [text, setText] = useState(String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);

  const ceiling = useMemo(() => Math.min(max, Math.max(min, balance)), [max, min, balance]);
  const tooRich = value > balance;

  const commit = (next: number) => {
    const clamped = Math.max(min, Math.min(max, Math.trunc(next) || min));
    onChange(clamped);
    setText(String(clamped));
  };

  const nudge = (factor: number) => {
    sound("click");
    commit(Math.round(value * factor));
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="bet-amount" className="text-[13px] font-medium text-[var(--text-dim)]">
            {label}
          </label>
          <button
            type="button"
            onClick={() => {
              sound("click");
              commit(ceiling);
            }}
            disabled={disabled}
            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)] transition-colors hover:text-[var(--color-emerald-400)]"
          >
            Max {formatCoins(ceiling)}
          </button>
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
            <CoinMark size={15} />
          </span>
          <input
            id="bet-amount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="field tabular pl-10 pr-24 text-base font-semibold"
            value={text}
            disabled={disabled}
            onFocus={() => {
              editing.current = true;
            }}
            onChange={(event) => {
              const digits = event.target.value.replace(/[^\d]/g, "");
              setText(digits);
              const parsed = Number(digits);
              if (digits && Number.isFinite(parsed)) onChange(Math.min(max, parsed));
            }}
            onBlur={() => {
              editing.current = false;
              commit(Number(text));
            }}
            aria-invalid={tooRich}
            aria-describedby={tooRich ? "bet-error" : undefined}
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-1">
            <button
              type="button"
              onClick={() => nudge(0.5)}
              disabled={disabled}
              className="flex h-8 min-w-[34px] items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--color-frost-100)_6%,transparent)] px-2 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              aria-label="Puolita panos"
            >
              ½
            </button>
            <button
              type="button"
              onClick={() => nudge(2)}
              disabled={disabled}
              className="flex h-8 min-w-[34px] items-center justify-center rounded-md bg-[color-mix(in_oklab,var(--color-frost-100)_6%,transparent)] px-2 text-[11px] font-bold text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
              aria-label="Kaksinkertaista panos"
            >
              2×
            </button>
          </div>
        </div>

        {tooRich && (
          <p id="bet-error" className="mt-1.5 text-xs text-[var(--color-danger-400)]">
            Coinit eivät riitä.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_BETS.filter((amount) => amount <= max).map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={disabled}
            onClick={() => {
              sound("click");
              commit(amount);
            }}
            className={`min-h-[36px] flex-1 rounded-[10px] border px-2 text-[13px] font-semibold transition-colors ${
              value === amount
                ? "border-[color-mix(in_oklab,var(--color-emerald-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-emerald-500)_14%,transparent)] text-[var(--color-emerald-300)]"
                : "border-[var(--line)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-dim)]"
            }`}
          >
            {amount}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            sound("click");
            commit(ceiling);
          }}
          className="min-h-[36px] flex-1 rounded-[10px] border border-[var(--line)] px-2 text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-dim)]"
        >
          Max
        </button>
      </div>

      {extra}
      {children}
    </div>
  );
}
