"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiPost, idempotencyKey, ApiError } from "@/lib/client/api";
import { Icon } from "@/components/ui/Icons";
import { Coins, Pill, SectionHeader } from "@/components/ui/primitives";
import { usePlayer, useSettleResponse } from "@/components/providers/PlayerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { formatCoins, formatMultiplier } from "@/lib/format";
import { useRecentGames } from "@/lib/client/library";
import {
  ARCADE_RULES,
  WHEEL,
  choiceOdds,
  plinkoBuckets,
  type ArcadeGame as ArcadeKey,
} from "@/lib/games/arcade";
import GameArt from "./GameArt";

/**
 * One component for all five arcade games.
 *
 * They share a settlement endpoint and a shape — choose parameters, wager,
 * settle — so they share a shell. What differs is the options panel and the
 * odds table, both of which are derived from `src/lib/games/arcade.ts`: the same
 * module the server settles with. That is deliberate. A rules panel maintained
 * separately from the payout maths is a rules panel that eventually lies.
 *
 * Two games (tower, hi-lo) hold server-side session state and can be cashed
 * out. The rest settle in one request.
 */

type Settled = {
  balance: number;
  bet: number;
  payout: number;
  profit: number;
  multiplier: number;
  outcome: "WIN" | "LOSS" | "PUSH";
  roundId: string;
  result: Record<string, unknown>;
  level?: number;
  leveledUp?: boolean;
  unlocked?: { title: string; description: string; coinReward: number }[];
};

type SessionState = {
  sessionId: string;
  bet: number;
  step: number;
  multiplier: number;
  current: number;
  columns: number;
  choices: number[];
  cards: number[];
  done?: boolean;
  payout?: number;
  profit?: number;
  balance?: number;
};

const INTERACTIVE: ArcadeKey[] = ["tower", "hilo"];
const QUICK = [10, 50, 100, 500] as const;

const CARD_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export default function ArcadeGame({
  game,
  min,
  max,
}: {
  game: ArcadeKey;
  min: number;
  max: number;
}) {
  const interactive = INTERACTIVE.includes(game);
  const { balance } = usePlayer();
  const settle = useSettleResponse();
  const { sound } = usePreferences();
  const toast = useToast();
  const { remember } = useRecentGames();

  // Recorded on open rather than on settle, so the lobby reflects where the
  // player has been even if they left without wagering.
  useEffect(() => remember(game), [game, remember]);

  const [bet, setBet] = useState(String(Math.max(min, 100)));
  const [side, setSide] = useState<"heads" | "tails">("heads");
  const [risk, setRisk] = useState<"low" | "high">("low");
  const [columns, setColumns] = useState<3 | 4>(3);
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<Settled | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [history, setHistory] = useState<Settled[]>([]);
  const [error, setError] = useState<string | null>(null);

  /*
    One key per intent, held across retries.

    Regenerated only once a settlement has actually come back, so a double-click
    or a retried request resolves to the same round instead of a second wager.
  */
  const key = useRef(idempotencyKey());
  const fresh = () => {
    key.current = idempotencyKey();
  };

  const wager = Number.parseInt(bet.replace(/[^\d]/g, ""), 10) || 0;
  const tooSmall = wager < min;
  const tooBig = wager > max || wager > balance;
  const canPlay = !pending && !tooSmall && !tooBig;

  /* An interrupted round is resumable: the server still holds the session. */
  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    void apiFetch<{ session: SessionState | null }>(`/api/games/arcade?game=${game}`)
      .then((data) => {
        if (!cancelled && data.session) {
          setSession(data.session);
          setBet(String(data.session.bet));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [game, interactive]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      setPending(true);
      setError(null);
      try {
        return await apiPost<Settled & SessionState>("/api/games/arcade", {
          game,
          bet: wager,
          side,
          risk,
          columns,
          idempotencyKey: key.current,
          ...body,
        });
      } finally {
        setPending(false);
      }
    },
    [game, wager, side, risk, columns],
  );

  const fail = (cause: unknown) => {
    const message = cause instanceof ApiError ? cause.message : "Kierros epäonnistui.";
    setError(message);
    sound("error");
    // Nothing was debited on a refusal, so the same intent may be retried.
    if (!(cause instanceof ApiError) || cause.status !== 409) fresh();
  };

  const finish = (data: Settled) => {
    setLast(data);
    setHistory((rows) => [data, ...rows].slice(0, 12));
    settle(data);
    // The sound reports what actually happened. A net loss never gets the win
    // cue, however large the raw payout was.
    sound(data.profit > 0 ? "win" : data.profit === 0 ? "navigate" : "lose");
    fresh();
  };

  const playInstant = async () => {
    try {
      finish(await send({ action: "play" }));
    } catch (cause) {
      fail(cause);
    }
  };

  const startSession = async () => {
    try {
      const data = await send({ action: "start" });
      setSession(data);
      setLast(null);
      sound("navigate");
      fresh();
    } catch (cause) {
      fail(cause);
    }
  };

  const step = async (choice: number) => {
    if (!session) return;
    try {
      const data = await send({ action: "choose", sessionId: session.sessionId, choice });
      if (data.done) {
        setSession(null);
        finish(data);
      } else {
        setSession(data);
        sound("navigate");
        fresh();
      }
    } catch (cause) {
      fail(cause);
    }
  };

  const cashout = async () => {
    if (!session) return;
    try {
      const data = await send({ action: "cashout", sessionId: session.sessionId });
      setSession(null);
      finish(data);
      toast.success("Voitot nostettu", `${formatCoins(data.payout)} coins`);
    } catch (cause) {
      fail(cause);
    }
  };

  /* ------------------------------------------------------------- previews */

  const preview = useMemo(() => {
    if (game === "coinflip") {
      return [{ label: "Oikein", chance: 0.5, multiplier: 1.98 }];
    }
    if (game === "wheel") {
      // Distinct multipliers, each with its share of the eight equal segments.
      const counts = new Map<number, number>();
      for (const raw of WHEEL) counts.set(raw * 0.99, (counts.get(raw * 0.99) ?? 0) + 1);
      return [...counts.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([multiplier, n]) => ({
          label: `${formatMultiplier(multiplier)}×`,
          chance: n / WHEEL.length,
          multiplier,
        }));
    }
    if (game === "plinko") {
      return plinkoBuckets(risk).map((bucket, index) => ({
        label: `Kori ${index + 1}`,
        chance: bucket.probability,
        multiplier: bucket.multiplier,
      }));
    }
    return [];
  }, [game, risk]);

  const nextStepOdds = useMemo(() => {
    if (!interactive || !session) return null;
    if (game === "tower") {
      const chance = choiceOdds("tower", { columns: session.columns, current: 0 }, 0);
      return [{ label: "Turvallinen askel", chance, multiplier: (session.multiplier * 0.99) / chance }];
    }
    const higher = choiceOdds("hilo", { columns: 2, current: session.current }, 1);
    const lower = choiceOdds("hilo", { columns: 2, current: session.current }, 0);
    return [
      { label: "Korkeampi", chance: higher, multiplier: higher > 0 ? (session.multiplier * 0.99) / higher : 0 },
      { label: "Matalampi", chance: lower, multiplier: lower > 0 ? (session.multiplier * 0.99) / lower : 0 },
    ];
  }, [game, interactive, session]);

  /* ---------------------------------------------------------------- view */

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ------------------------------------------------------- board */}
      <section className="panel panel-lit mb-wave overflow-hidden p-5 sm:p-6">
        <div className="mx-auto max-w-[420px]">
          <GameArt game={game} large />
        </div>

        {/* Result, stated in net terms. */}
        <div className="mt-5 min-h-[86px]" aria-live="polite">
          {session ? (
            <SessionBoard game={game} session={session} onStep={step} pending={pending} />
          ) : last ? (
            <Outcome settled={last} />
          ) : (
            <p className="text-center text-[13px] leading-relaxed text-[var(--text-muted)]">
              {interactive
                ? "Aseta panos ja aloita kierros. Voit nostaa voitot minkä tahansa onnistuneen askeleen jälkeen."
                : "Aseta panos ja pelaa. Kertoimet ja todennäköisyydet näkyvät maksutaulukossa."}
            </p>
          )}
        </div>

        {session && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--line-accent)] bg-[var(--color-obsidian-900)] px-4 py-3">
            <div>
              <p className="eyebrow">Nostettavissa</p>
              <p className="balance text-[20px] font-bold text-[var(--color-emerald-300)]">
                {formatCoins(Math.floor(session.bet * session.multiplier))}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending || session.step === 0}
              onClick={cashout}
            >
              {session.step === 0 ? "Tee ensin valinta" : "Nosta voitot"}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-center text-[13px] text-[var(--color-danger-400)]">
            {error}
          </p>
        )}
      </section>

      {/* -------------------------------------------------------- panel */}
      <div className="space-y-4">
        <section className="panel p-5">
          <SectionHeader eyebrow="Panos" title="Kierros" />

          <label htmlFor="arcade-bet" className="sr-only">
            Panos
          </label>
          <input
            id="arcade-bet"
            className="field mt-4"
            inputMode="numeric"
            autoComplete="off"
            value={bet}
            disabled={Boolean(session)}
            aria-invalid={tooSmall || tooBig ? "true" : undefined}
            aria-describedby="arcade-bet-help"
            onChange={(event) => setBet(event.target.value.replace(/[^\d]/g, ""))}
          />

          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK.filter((value) => value >= min && value <= max).map((value) => (
              <button
                key={value}
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={Boolean(session)}
                onClick={() => setBet(String(value))}
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={Boolean(session)}
              onClick={() => setBet(String(Math.max(min, Math.min(max, balance))))}
            >
              Max
            </button>
          </div>

          <p id="arcade-bet-help" className="mt-2 text-[12px] text-[var(--text-faint)]">
            {tooSmall ? (
              <span className="text-[var(--color-danger-400)]">Pienin panos on {formatCoins(min)}.</span>
            ) : tooBig ? (
              <span className="text-[var(--color-danger-400)]">
                {wager > balance ? "Saldosi ei riitä." : `Suurin panos on ${formatCoins(max)}.`}
              </span>
            ) : (
              <>
                Rajat {formatCoins(min)}–{formatCoins(max)} · saldo {formatCoins(balance)}
              </>
            )}
          </p>

          {/* Game-specific options */}
          {game === "coinflip" && !session && (
            <Choice
              label="Valintasi"
              options={[
                { id: "heads", label: "Kruuna" },
                { id: "tails", label: "Klaava" },
              ]}
              value={side}
              onChange={(value) => setSide(value as "heads" | "tails")}
            />
          )}

          {game === "plinko" && (
            <Choice
              label="Riskitaso"
              hint="Riski muuttaa maksuja, ei todennäköisyyksiä."
              options={[
                { id: "low", label: "Matala" },
                { id: "high", label: "Korkea" },
              ]}
              value={risk}
              onChange={(value) => setRisk(value as "low" | "high")}
            />
          )}

          {game === "tower" && !session && (
            <Choice
              label="Sarakkeita"
              hint="Enemmän sarakkeita: turvallisempi askel, pienempi kerroin."
              options={[
                { id: "3", label: "3 (2/3 turvassa)" },
                { id: "4", label: "4 (3/4 turvassa)" },
              ]}
              value={String(columns)}
              onChange={(value) => setColumns(Number(value) as 3 | 4)}
            />
          )}

          {!session && (
            <button
              type="button"
              className="btn btn-primary mt-5 w-full"
              data-busy={pending || undefined}
              disabled={!canPlay}
              onClick={interactive ? startSession : playInstant}
            >
              {pending ? "Ratkaistaan…" : interactive ? "Aloita kierros" : "Pelaa"}
              {!pending && <Icon name="arrowRight" size={15} className="btn-nudge" />}
            </button>
          )}
        </section>

        {/* Odds — always from the same module the server settles with. */}
        <section className="panel p-5">
          <SectionHeader
            eyebrow="Kertoimet"
            title={session ? "Seuraava askel" : "Maksutaulukko"}
          />
          <ul className="mt-4 space-y-1.5">
            {(session ? (nextStepOdds ?? []) : preview).map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-3 rounded-[8px] px-2 py-1.5 text-[13px] odd:bg-[color-mix(in_oklab,var(--color-frost-100)_3%,transparent)]"
              >
                <span className="text-[var(--text-muted)]">{row.label}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular text-[12px] text-[var(--text-faint)]">
                    {(row.chance * 100).toFixed(row.chance < 0.01 ? 2 : 1)} %
                  </span>
                  <span className="tabular font-semibold text-[var(--color-emerald-300)]">
                    {formatMultiplier(row.multiplier)}×
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--text-faint)]">
            Kerroin on kokonaispalautus panokseen nähden. Alle 1,00× tarkoittaa tappiota.
          </p>
        </section>

        {/* Rules, verbatim from the module the server uses. */}
        <section className="panel p-5">
          <SectionHeader eyebrow="Säännöt" title="Miten peli toimii" />
          <p className="mt-3 text-[12px] leading-relaxed text-[var(--text-muted)]">
            {ARCADE_RULES[game]}
          </p>
        </section>

        {history.length > 0 && (
          <section className="panel p-5">
            <SectionHeader eyebrow="Historia" title="Viimeisimmät kierrokset" />
            <ul className="mt-3 space-y-1">
              {history.map((row, index) => (
                <li
                  key={`${row.roundId}-${index}`}
                  className="flex items-center justify-between gap-3 text-[12px]"
                >
                  <span className="tabular text-[var(--text-faint)]">
                    {formatCoins(row.bet)} → {formatCoins(row.payout)}
                  </span>
                  <span
                    className={`tabular font-semibold ${
                      row.profit > 0
                        ? "text-[var(--color-emerald-400)]"
                        : row.profit < 0
                          ? "text-[var(--color-danger-400)]"
                          : "text-[var(--text-muted)]"
                    }`}
                  >
                    {row.profit > 0 ? "+" : ""}
                    {formatCoins(row.profit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Choice({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="mt-4">
      <legend className="eyebrow mb-2">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={`btn btn-sm ${value === option.id ? "btn-primary" : "btn-ghost"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <p className="mt-2 text-[11px] text-[var(--text-faint)]">{hint}</p>}
    </fieldset>
  );
}

/**
 * The settled round, stated in net terms.
 *
 * The headline is profit, not payout — a 100-coin wager returning 86 is a loss,
 * and showing "86" in celebratory green would be a lie the player only catches
 * later in their balance.
 */
function Outcome({ settled }: { settled: Settled }) {
  const won = settled.profit > 0;
  const even = settled.profit === 0;

  return (
    <div className="text-center">
      <p className="eyebrow">{won ? "Voitto" : even ? "Tasapeli" : "Tappio"}</p>
      <p
        className={`balance mt-1 text-[clamp(1.8rem,6vw,2.4rem)] font-bold leading-none ${
          won
            ? "text-[var(--color-emerald-300)]"
            : even
              ? "text-[var(--text-dim)]"
              : "text-[var(--color-danger-400)]"
        }`}
      >
        {settled.profit > 0 ? "+" : ""}
        {formatCoins(settled.profit)}
      </p>
      <p className="mt-2 text-[12px] text-[var(--text-faint)]">
        Panos {formatCoins(settled.bet)} · palautus {formatCoins(settled.payout)} ·{" "}
        {formatMultiplier(settled.multiplier)}×
      </p>
    </div>
  );
}

function SessionBoard({
  game,
  session,
  onStep,
  pending,
}: {
  game: ArcadeKey;
  session: SessionState;
  onStep: (choice: number) => void;
  pending: boolean;
}) {
  if (game === "hilo") {
    const higher = choiceOdds("hilo", { columns: 2, current: session.current }, 1);
    const lower = choiceOdds("hilo", { columns: 2, current: session.current }, 0);
    return (
      <div className="text-center">
        <p className="eyebrow">Nykyinen kortti</p>
        <p className="mt-1 font-mono text-[clamp(2rem,7vw,2.8rem)] font-bold leading-none text-[var(--color-cyan-300)]">
          {CARD_LABEL[session.current] ?? session.current}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending || higher <= 0}
            onClick={() => onStep(1)}
          >
            <Icon name="chevronUp" size={15} />
            Korkeampi
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending || lower <= 0}
            onClick={() => onStep(0)}
          >
            <Icon name="chevronDown" size={15} />
            Matalampi
          </button>
        </div>
        <p className="mt-3 text-[11px] text-[var(--text-faint)]">
          Tasapeli häviää. Askel {session.step + 1}/8 · kerroin{" "}
          {formatMultiplier(session.multiplier)}×
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="eyebrow">Kerros {session.step + 1}/8</p>
      <div className="mt-3 flex justify-center gap-2">
        {Array.from({ length: session.columns }, (_, index) => (
          <button
            key={index}
            type="button"
            className="btn btn-ghost h-14 w-16"
            disabled={pending}
            aria-label={`Sarake ${index + 1}`}
            onClick={() => onStep(index)}
          >
            <Icon name="cases" size={18} />
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[var(--text-faint)]">
        Yksi ansa kerrosta kohti · kerroin {formatMultiplier(session.multiplier)}×
      </p>
    </div>
  );
}
