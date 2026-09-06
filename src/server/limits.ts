import "server-only";
import { prisma, type Tx } from "./db";

/**
 * Player-set guard rails, enforced on the server.
 *
 * The asymmetry is the whole point: tightening a limit takes effect at once,
 * loosening one waits out a cooling-off period. A limit that can be lifted the
 * moment it starts to bite is not a limit, it is a speed bump — and the moment
 * it bites is exactly when the player is least able to weigh the decision.
 *
 * These checks live in the settlement path rather than the UI, because the UI is
 * not the control. A client that hides the bet button still has to be told "no"
 * by the server when it asks anyway.
 */

export const LOOSEN_DELAY_MS = 24 * 60 * 60 * 1000;
export const MAX_BREAK_MS = 90 * 24 * 60 * 60 * 1000;

export class LimitError extends Error {
  status: number;
  code: string;
  constructor(message: string, code: string, status = 429) {
    super(message);
    this.name = "LimitError";
    this.code = code;
    this.status = status;
  }
}

export type LimitState = {
  dailyWagerCap: number | null;
  maxBet: number | null;
  breakUntil: string | null;
  /** A loosened cap that has not taken effect yet. */
  pendingCap: number | null;
  pendingCapAt: string | null;
  wageredToday: number;
  remainingToday: number | null;
};

/** Rolling 24 hours, computed from the ledger rather than a counter that can drift. */
export async function wageredLast24h(userId: string, db: Tx = prisma): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db.transaction.aggregate({
    where: { userId, type: "GAME_BET", createdAt: { gte: since } },
    _sum: { amount: true },
  });
  // Bets are stored as negative amounts.
  return Math.abs(result._sum.amount ?? 0);
}

/**
 * Resolves the effective limits, applying any pending loosening whose delay has
 * now elapsed. Reading is the natural place to do this — it keeps the state
 * correct without a scheduled job.
 */
export async function getLimits(userId: string, db: Tx = prisma): Promise<LimitState> {
  let row = await db.playLimits.findUnique({ where: { userId } });

  if (row?.pendingCapAt && row.pendingCapAt <= new Date()) {
    row = await db.playLimits.update({
      where: { userId },
      data: { dailyWagerCap: row.pendingCap, pendingCap: null, pendingCapAt: null },
    });
  }

  const wageredToday = await wageredLast24h(userId, db);
  const cap = row?.dailyWagerCap ?? null;

  return {
    dailyWagerCap: cap,
    maxBet: row?.maxBet ?? null,
    breakUntil: row?.breakUntil?.toISOString() ?? null,
    pendingCap: row?.pendingCap ?? null,
    pendingCapAt: row?.pendingCapAt?.toISOString() ?? null,
    wageredToday,
    remainingToday: cap === null ? null : Math.max(0, cap - wageredToday),
  };
}

/**
 * The gate every wager passes through.
 *
 * Called before the debit, and cheap enough to call on every round: one indexed
 * aggregate plus one primary-key read.
 */
export async function assertCanWager(userId: string, bet: number, db: Tx = prisma): Promise<void> {
  const limits = await getLimits(userId, db);

  if (limits.breakUntil && new Date(limits.breakUntil) > new Date()) {
    throw new LimitError(
      `Olet asettanut itsellesi tauon. Pelaaminen jatkuu ${new Date(limits.breakUntil).toLocaleString("fi-FI")}.`,
      "ON_BREAK",
      403,
    );
  }

  if (limits.maxBet !== null && bet > limits.maxBet) {
    throw new LimitError(
      `Asettamasi panosraja on ${limits.maxBet} coinsia.`,
      "MAX_BET",
      429,
    );
  }

  if (limits.remainingToday !== null && bet > limits.remainingToday) {
    throw new LimitError(
      `Vuorokauden panosrajasi on täynnä. Jäljellä ${limits.remainingToday} coinsia.`,
      "DAILY_CAP",
      429,
    );
  }
}

export type LimitUpdate = {
  dailyWagerCap?: number | null;
  maxBet?: number | null;
  breakHours?: number | null;
};

/**
 * Applies a change.
 *
 * Tightening (a lower cap, or no cap → a cap) is immediate. Loosening is parked
 * in `pendingCap` and only lands after `LOOSEN_DELAY_MS`. Removing a cap counts
 * as loosening.
 */
export async function updateLimits(userId: string, input: LimitUpdate): Promise<LimitState> {
  const existing = await prisma.playLimits.findUnique({ where: { userId } });
  const data: Record<string, unknown> = {};

  if (input.maxBet !== undefined) {
    const next = input.maxBet === null ? null : Math.max(1, Math.trunc(input.maxBet));
    const current = existing?.maxBet ?? null;
    const loosening = current !== null && (next === null || next > current);
    if (loosening) {
      throw new LimitError(
        "Panosrajan nostaminen vaatii, että poistat sen ensin — ja se tulee voimaan vasta vuorokauden kuluttua.",
        "LOOSEN_DELAYED",
        409,
      );
    }
    data.maxBet = next;
  }

  if (input.dailyWagerCap !== undefined) {
    const next = input.dailyWagerCap === null ? null : Math.max(1, Math.trunc(input.dailyWagerCap));
    const current = existing?.dailyWagerCap ?? null;
    const loosening = current !== null && (next === null || next > current);

    if (loosening) {
      // Parked, not applied. The player is told exactly when it lands.
      data.pendingCap = next;
      data.pendingCapAt = new Date(Date.now() + LOOSEN_DELAY_MS);
    } else {
      data.dailyWagerCap = next;
      data.pendingCap = null;
      data.pendingCapAt = null;
    }
  }

  if (input.breakHours !== undefined && input.breakHours !== null) {
    const hours = Math.max(1, Math.trunc(input.breakHours));
    const until = new Date(Date.now() + Math.min(MAX_BREAK_MS, hours * 60 * 60 * 1000));
    const current = existing?.breakUntil;
    // A break can only ever be extended, never cut short.
    if (current && current > until) {
      throw new LimitError("Käynnissä olevaa taukoa ei voi lyhentää.", "BREAK_ACTIVE", 409);
    }
    data.breakUntil = until;
  }

  await prisma.playLimits.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  return getLimits(userId);
}
