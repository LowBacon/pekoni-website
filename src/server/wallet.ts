import "server-only";
import { prisma, type Tx } from "./db";
import type { TransactionType } from "@/lib/enums";

export class WalletError extends Error {
  status: number;
  code: string;
  constructor(message: string, code = "WALLET_ERROR", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS";

export type LedgerEntry = {
  type: TransactionType;
  /** Positive number. Direction comes from `type` via `isCredit`. */
  amount: number;
  source: string;
  gameId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const CREDIT_TYPES = new Set<TransactionType>([
  "GAME_WIN",
  "CASE_REWARD",
  "DAILY_REWARD",
  "BATTLE_WIN",
  "SOCIAL_REWARD",
  "TRANSFER_REFUND",
  "SIGNUP_BONUS",
]);

function isCredit(type: TransactionType, amount: number): boolean {
  if (type === "ADMIN_ADJUSTMENT") return amount >= 0;
  return CREDIT_TYPES.has(type);
}

/**
 * Moves coins and writes the ledger entry in the same database transaction.
 *
 * Debits use a conditional UPDATE (`balance >= amount`) so two concurrent
 * requests can never both pass a balance check and overdraw the wallet — the
 * second one matches zero rows and throws. The row lock taken by that UPDATE is
 * held until commit, so reading the resulting balance back inside the same
 * transaction is safe on both SQLite and PostgreSQL.
 */
export async function applyLedgerEntry(
  tx: Tx,
  userId: string,
  entry: LedgerEntry,
): Promise<{ balanceBefore: number; balanceAfter: number; transactionId: string }> {
  const amount = Math.abs(entry.amount);
  if (!Number.isSafeInteger(amount) || amount > 2_000_000_000) {
    throw new WalletError("Virheellinen summa.", "INVALID_AMOUNT");
  }
  const credit = isCredit(entry.type, entry.amount);
  const signed = credit ? amount : -amount;

  if (credit) {
    await tx.wallet.update({
      where: { userId },
      data: { balance: { increment: amount }, version: { increment: 1 } },
    });
  } else {
    const changed = await tx.wallet.updateMany({
      where: { userId, balance: { gte: amount } },
      data: { balance: { decrement: amount }, version: { increment: 1 } },
    });
    if (changed.count === 0) {
      throw new WalletError("Coinit eivät riitä.", INSUFFICIENT_FUNDS, 400);
    }
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  const balanceAfter = wallet.balance;
  const balanceBefore = balanceAfter - signed;

  const transaction = await tx.transaction.create({
    data: {
      userId,
      type: entry.type,
      amount: signed,
      balanceBefore,
      balanceAfter,
      source: entry.source,
      gameId: entry.gameId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    },
    select: { id: true },
  });

  return { balanceBefore, balanceAfter, transactionId: transaction.id };
}

export async function getBalance(userId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return wallet?.balance ?? 0;
}

/**
 * Replay protection. The first caller with a given key wins; retries of the
 * same request return the stored response instead of moving coins twice.
 */
export async function claimIdempotencyKey(
  tx: Tx,
  key: string,
  userId: string,
  scope: string,
): Promise<{ fresh: boolean; result: unknown }> {
  const existing = await tx.idempotencyKey.findUnique({ where: { key } });
  if (existing) {
    if (existing.userId !== userId || existing.scope !== scope) {
      throw new WalletError("Virheellinen pyyntötunniste.", "BAD_IDEMPOTENCY_KEY", 409);
    }
    return { fresh: false, result: existing.result ? JSON.parse(existing.result) : null };
  }
  await tx.idempotencyKey.create({ data: { key, userId, scope } });
  return { fresh: true, result: null };
}

export async function storeIdempotentResult(
  tx: Tx,
  key: string,
  result: unknown,
): Promise<void> {
  await tx.idempotencyKey.update({
    where: { key },
    data: { result: JSON.stringify(result) },
  });
}

/** Housekeeping — keys older than a day can no longer be replayed usefully. */
export async function pruneIdempotencyKeys(): Promise<void> {
  // Retain replay keys permanently; replaying an old request must never debit again.
}
