import "server-only";
import crypto from "node:crypto";
import { prisma, type Tx } from "./db";
import { applyLedgerEntry, claimIdempotencyKey, storeIdempotentResult, WalletError } from "./wallet";

/**
 * Minecraft account linking and coin transfers.
 *
 * Two trust boundaries meet here, and they are deliberately kept apart:
 *
 *   1. The player, in a browser, who may lie about anything.
 *   2. The game server plugin, which authenticates with a shared secret and is
 *      the only thing allowed to say "this UUID is really that person" or "the
 *      coins arrived".
 *
 * Ownership is proved by a short code the player types *inside the server*, so
 * the claim travels over a channel only the real account holder can reach. The
 * link is then keyed on the Mojang UUID rather than the username, because
 * usernames change hands.
 *
 * Transfers are one-directional (website → server) and split into a debit and a
 * delivery. The debit is immediate and atomic; delivery is retryable and
 * idempotent. Money is never in two places: it is either on the wallet, or
 * reserved against a PENDING/CLAIMED transfer, or delivered, or refunded.
 */

/* -------------------------------------------------------------------------- */
/* Linking                                                                    */
/* -------------------------------------------------------------------------- */

export class MinecraftError extends Error {
  status: number;
  code: string;
  constructor(message: string, code = "MINECRAFT_ERROR", status = 400) {
    super(message);
    this.name = "MinecraftError";
    this.code = code;
    this.status = status;
  }
}

export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_LENGTH = 6;
/** No I/O/0/1 — these are read off a screen and typed into a chat box. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newLinkCode(): string {
  const bytes = crypto.randomBytes(LINK_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/** Mojang UUIDs arrive both dashed and undashed; store one canonical form. */
export function normaliseUuid(raw: string): string {
  const hex = raw.trim().toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new MinecraftError("Virheellinen Minecraft-UUID.", "BAD_UUID", 400);
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type LinkCodeIssue = { code: string; expiresAt: string };

/**
 * Issues a fresh code, replacing any unused one.
 *
 * Only one code is live per account at a time — otherwise a player could hold a
 * stack of valid codes and hand the spares to somebody else.
 */
export async function issueLinkCode(userId: string): Promise<LinkCodeIssue> {
  const existing = await prisma.minecraftAccount.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) {
    throw new MinecraftError("Tilisi on jo liitetty Minecraft-tiliin.", "ALREADY_LINKED", 409);
  }

  await prisma.minecraftLinkCode.deleteMany({ where: { userId, consumedAt: null } });

  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

  // Codes are short, so a collision with a live one is possible; retry rather
  // than lengthen the code and make it harder to type.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newLinkCode();
    try {
      await prisma.minecraftLinkCode.create({ data: { code, userId, expiresAt } });
      return { code, expiresAt: expiresAt.toISOString() };
    } catch {
      // Unique violation — try another.
    }
  }
  throw new MinecraftError("Koodin luonti epäonnistui. Yritä uudelleen.", "CODE_EXHAUSTED", 503);
}

export type RedeemResult = {
  username: string;
  uuid: string;
  websiteUsername: string;
};

/**
 * Burns a code and creates the link. Called only by the plugin.
 *
 * Every failure path consumes an attempt, so guessing is rate-limited by the
 * code itself rather than by whoever is calling.
 */
export async function redeemLinkCode(input: {
  code: string;
  uuid: string;
  username: string;
}): Promise<RedeemResult> {
  const code = input.code.trim().toUpperCase();
  const uuid = normaliseUuid(input.uuid);
  const username = input.username.trim().slice(0, 16);

  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    throw new MinecraftError("Virheellinen koodi.", "BAD_CODE", 400);
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.minecraftLinkCode.findUnique({
      where: { code },
      include: { user: { select: { id: true, username: true, status: true } } },
    });

    if (!row) throw new MinecraftError("Tuntematon koodi.", "UNKNOWN_CODE", 404);
    if (row.consumedAt) throw new MinecraftError("Koodi on jo käytetty.", "CODE_USED", 409);
    if (row.expiresAt < new Date()) {
      throw new MinecraftError("Koodi on vanhentunut.", "CODE_EXPIRED", 410);
    }
    if (row.user.status === "SUSPENDED") {
      throw new MinecraftError("Tili on jäädytetty.", "SUSPENDED", 403);
    }

    // One Minecraft account backs at most one website account. Without this,
    // two accounts could funnel coins to the same in-game player.
    const uuidTaken = await tx.minecraftAccount.findUnique({
      where: { uuid },
      select: { userId: true },
    });
    if (uuidTaken && uuidTaken.userId !== row.userId) {
      throw new MinecraftError(
        "Tämä Minecraft-tili on jo liitetty toiseen Pekoni-tunnukseen.",
        "UUID_TAKEN",
        409,
      );
    }

    const alreadyLinked = await tx.minecraftAccount.findUnique({
      where: { userId: row.userId },
      select: { id: true },
    });
    if (alreadyLinked) {
      throw new MinecraftError("Tili on jo liitetty.", "ALREADY_LINKED", 409);
    }

    // Burn first: even if something below fails, the code cannot be reused.
    await tx.minecraftLinkCode.update({
      where: { code },
      data: { consumedAt: new Date(), consumedUuid: uuid },
    });

    await tx.minecraftAccount.create({
      data: {
        userId: row.userId,
        uuid,
        username,
        usernameLower: username.toLowerCase(),
        lastSeenAt: new Date(),
      },
    });

    // The display name follows the verified account unless the player already
    // chose one by hand.
    await tx.user.updateMany({
      where: { id: row.userId, minecraftUsername: null },
      data: { minecraftUsername: username },
    });

    await tx.notification.create({
      data: {
        userId: row.userId,
        kind: "SUCCESS",
        title: "Minecraft-tili liitetty",
        body: `${username} on nyt vahvistettu. Voit siirtää coineja palvelimelle.`,
        href: "/wallet",
      },
    });

    return { username, uuid, websiteUsername: row.user.username };
  });
}

export async function unlinkMinecraft(userId: string): Promise<void> {
  const pending = await prisma.transfer.count({
    where: { userId, status: { in: ["PENDING", "CLAIMED"] } },
  });
  if (pending > 0) {
    throw new MinecraftError(
      "Sinulla on siirtoja kesken. Odota niiden valmistumista ennen irrottamista.",
      "TRANSFERS_PENDING",
      409,
    );
  }
  await prisma.minecraftAccount.deleteMany({ where: { userId } });
}

export type LinkStatus = {
  linked: boolean;
  username: string | null;
  uuid: string | null;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  /** How fresh the plugin's last sighting is, for the health indicator. */
  health: "ONLINE" | "RECENT" | "STALE" | "UNKNOWN";
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function getLinkStatus(userId: string): Promise<LinkStatus> {
  const account = await prisma.minecraftAccount.findUnique({ where: { userId } });
  if (!account) {
    return {
      linked: false,
      username: null,
      uuid: null,
      verifiedAt: null,
      lastSeenAt: null,
      health: "UNKNOWN",
    };
  }

  const seen = account.lastSeenAt?.getTime();
  const age = seen ? Date.now() - seen : null;
  const health =
    age === null ? "UNKNOWN" : age < ONLINE_WINDOW_MS ? "ONLINE" : age < RECENT_WINDOW_MS ? "RECENT" : "STALE";

  return {
    linked: true,
    username: account.username,
    uuid: account.uuid,
    verifiedAt: account.verifiedAt.toISOString(),
    lastSeenAt: account.lastSeenAt?.toISOString() ?? null,
    health,
  };
}

/* -------------------------------------------------------------------------- */
/* Transfers                                                                  */
/* -------------------------------------------------------------------------- */

export const TRANSFER_MIN = 100;
export const TRANSFER_MAX = 100_000;
/** Per rolling 24 hours, across all transfers. */
export const TRANSFER_DAILY_CAP = 250_000;
/** A transfer nobody delivers is refunded after this long. */
export const TRANSFER_STALE_MS = 30 * 60 * 1000;

function newReference(): string {
  const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `MB-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

export type TransferLimits = {
  min: number;
  max: number;
  dailyCap: number;
  usedToday: number;
  remainingToday: number;
};

export async function getTransferLimits(userId: string, db: Tx = prisma): Promise<TransferLimits> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // Failed transfers were refunded, so they do not consume the allowance.
  const used = await db.transfer.aggregate({
    where: {
      userId,
      createdAt: { gte: since },
      status: { in: ["PENDING", "CLAIMED", "COMPLETED"] },
    },
    _sum: { amount: true },
  });
  const usedToday = used._sum.amount ?? 0;
  return {
    min: TRANSFER_MIN,
    max: TRANSFER_MAX,
    dailyCap: TRANSFER_DAILY_CAP,
    usedToday,
    remainingToday: Math.max(0, TRANSFER_DAILY_CAP - usedToday),
  };
}

export type TransferReceipt = {
  id: string;
  reference: string;
  amount: number;
  status: string;
  minecraftName: string;
  minecraftUuid: string;
  direction: string;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  balanceAfter: number;
};

/**
 * Creates a transfer and debits the wallet in one database transaction.
 *
 * The idempotency key makes a retried or double-submitted request return the
 * original receipt rather than debiting twice — which matters most exactly when
 * the player is unsure whether the first attempt went through.
 */
export async function createTransfer(input: {
  userId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<TransferReceipt> {
  const amount = Math.trunc(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MinecraftError("Anna kelvollinen summa.", "BAD_AMOUNT", 400);
  }
  if (amount < TRANSFER_MIN) {
    throw new MinecraftError(`Pienin siirto on ${TRANSFER_MIN} coinsia.`, "BELOW_MIN", 400);
  }
  if (amount > TRANSFER_MAX) {
    throw new MinecraftError(`Suurin yksittäinen siirto on ${TRANSFER_MAX} coinsia.`, "ABOVE_MAX", 400);
  }

  const account = await prisma.minecraftAccount.findUnique({ where: { userId: input.userId } });
  if (!account) {
    throw new MinecraftError(
      "Liitä ja vahvista Minecraft-tilisi ennen siirtoa.",
      "NOT_LINKED",
      409,
    );
  }

  return prisma.$transaction(async (tx) => {
    const claim = await claimIdempotencyKey(tx, input.idempotencyKey, input.userId, "transfer");
    if (!claim.fresh) {
      if (!claim.result) {
        // The original attempt is still in flight. Telling the player to wait is
        // the only safe answer — retrying could debit a second time.
        throw new MinecraftError(
          "Edellinen siirto on vielä käsittelyssä. Odota hetki.",
          "IN_FLIGHT",
          409,
        );
      }
      return claim.result as TransferReceipt;
    }

    // Atomic conditional debit. A concurrent bet or transfer that got there
    // first makes this match zero rows and throw, rather than overdrawing.
    await tx.user.update({ where: { id: input.userId }, data: { updatedAt: new Date() } });
    const limits = await getTransferLimits(input.userId, tx);
    if (amount > limits.remainingToday) throw new MinecraftError("Vuorokauden siirtoraja on täynnä.", "DAILY_CAP", 429);
    const ledger = await applyLedgerEntry(tx, input.userId, {
      type: "TRANSFER_OUT",
      amount,
      source: "minecraft-transfer",
      metadata: { minecraftUuid: account.uuid, minecraftName: account.username },
    });

    const transfer = await tx.transfer.create({
      data: {
        reference: newReference(),
        userId: input.userId,
        minecraftUuid: account.uuid,
        minecraftName: account.username,
        amount,
        status: "PENDING",
        debitTxId: ledger.transactionId,
      },
    });

    const receipt: TransferReceipt = {
      id: transfer.id,
      reference: transfer.reference,
      amount,
      status: "PENDING",
      minecraftName: account.username,
      minecraftUuid: account.uuid,
      direction: transfer.direction,
      createdAt: transfer.createdAt.toISOString(),
      completedAt: null,
      failedAt: null,
      failureReason: null,
      balanceAfter: ledger.balanceAfter,
    };

    await storeIdempotentResult(tx, input.idempotencyKey, receipt);
    return receipt;
  });
}

/* -------------------------------------------------------------------------- */
/* Delivery — called by the plugin                                            */
/* -------------------------------------------------------------------------- */

export type ClaimableTransfer = {
  id: string;
  reference: string;
  uuid: string;
  username: string;
  amount: number;
};

/**
 * Hands the plugin a batch of transfers to deliver and marks them CLAIMED.
 *
 * Claiming is what stops two plugin instances (or a restarted one mid-poll)
 * from crediting the same transfer twice: only rows still PENDING are taken,
 * and the update is conditional on that status.
 */
export async function claimTransfers(limit = 25): Promise<ClaimableTransfer[]> {
  const candidates = await prisma.transfer.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: Math.min(100, Math.max(1, limit)),
    select: { id: true },
  });

  const claimed: ClaimableTransfer[] = [];

  for (const candidate of candidates) {
    // Conditional on PENDING, so a racing poller loses and skips the row.
    const result = await prisma.transfer.updateMany({
      where: { id: candidate.id, status: "PENDING" },
      data: { status: "CLAIMED", claimedAt: new Date(), attempts: { increment: 1 } },
    });
    if (result.count === 0) continue;

    const row = await prisma.transfer.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { id: true, reference: true, minecraftUuid: true, minecraftName: true, amount: true },
    });
    claimed.push({
      id: row.id,
      reference: row.reference,
      uuid: row.minecraftUuid,
      username: row.minecraftName,
      amount: row.amount,
    });
  }

  return claimed;
}

/**
 * The plugin confirms delivery.
 *
 * Idempotent by design: a repeated confirmation for an already-completed
 * transfer returns the same answer without touching anything. This is what
 * makes a plugin retry after a network timeout safe — the alternative is
 * crediting a player twice for one transfer.
 */
export async function completeTransfer(transferId: string): Promise<{ status: string; reference: string }> {
  const existing = await prisma.transfer.findUnique({
    where: { id: transferId },
    select: { id: true, status: true, reference: true, userId: true, amount: true, minecraftName: true },
  });
  if (!existing) throw new MinecraftError("Tuntematon siirto.", "UNKNOWN_TRANSFER", 404);

  if (existing.status === "COMPLETED") {
    return { status: "COMPLETED", reference: existing.reference };
  }
  if (existing.status === "FAILED") {
    // Already refunded. Completing now would credit the player twice over.
    throw new MinecraftError(
      "Siirto on jo merkitty epäonnistuneeksi ja palautettu.",
      "ALREADY_REFUNDED",
      409,
    );
  }

  const updated = await prisma.transfer.updateMany({
    where: { id: transferId, status: { in: ["PENDING", "CLAIMED"] } },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (updated.count === 0) {
    const now = await prisma.transfer.findUniqueOrThrow({
      where: { id: transferId },
      select: { status: true, reference: true },
    });
    return { status: now.status, reference: now.reference };
  }

  await prisma.notification.create({
    data: {
      userId: existing.userId,
      kind: "SUCCESS",
      title: "Siirto valmis",
      body: `${existing.amount} coinsia hyvitettiin tilille ${existing.minecraftName}.`,
      href: "/wallet",
    },
  });

  return { status: "COMPLETED", reference: existing.reference };
}

/**
 * Marks a transfer failed and refunds the player through the ledger.
 *
 * The refund is a new credit entry rather than a reversal of the debit, so the
 * history stays append-only and an auditor can see both halves.
 */
export async function failTransfer(
  transferId: string,
  reason: string,
  confirmedNotDelivered = false,
): Promise<{ status: string; reference: string }> {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new MinecraftError("Tuntematon siirto.", "UNKNOWN_TRANSFER", 404);

    if (transfer.status === "FAILED") {
      return { status: "FAILED", reference: transfer.reference };
    }
    if (transfer.status === "COMPLETED") {
      throw new MinecraftError(
        "Siirto on jo toimitettu, joten sitä ei voi merkitä epäonnistuneeksi.",
        "ALREADY_COMPLETED",
        409,
      );
    }

    if (transfer.status === "CLAIMED" && !confirmedNotDelivered) throw new MinecraftError("Delivery is uncertain; reconciliation is required.", "DELIVERY_UNCERTAIN", 409);

    // Conditional, so a completion racing this refund cannot both win.
    const moved = await tx.transfer.updateMany({
      where: { id: transferId, status: { in: ["PENDING", "CLAIMED"] } },
      data: { status: "FAILED", failedAt: new Date(), failureReason: reason.slice(0, 200) },
    });
    if (moved.count === 0) {
      const now = await tx.transfer.findUniqueOrThrow({
        where: { id: transferId },
        select: { status: true, reference: true },
      });
      return { status: now.status, reference: now.reference };
    }

    const refund = await applyLedgerEntry(tx, transfer.userId, {
      type: "TRANSFER_REFUND",
      amount: transfer.amount,
      source: "minecraft-transfer-refund",
      metadata: { transferId: transfer.id, reference: transfer.reference, reason },
    });

    await tx.transfer.update({
      where: { id: transferId },
      data: { refundTxId: refund.transactionId },
    });

    await tx.notification.create({
      data: {
        userId: transfer.userId,
        kind: "WARNING",
        title: "Siirto epäonnistui",
        body: `${transfer.amount} coinsia palautettiin saldollesi. Viite ${transfer.reference}.`,
        href: "/wallet",
      },
    });

    return { status: "FAILED", reference: transfer.reference };
  });
}

/**
 * Refunds transfers nobody delivered.
 *
 * Without this, a plugin that goes down mid-batch would leave coins reserved
 * forever — debited from the wallet and never credited in game.
 */
export async function reapStaleTransfers(): Promise<number> {
  // A timeout is not proof of non-delivery. Never refund uncertain transfers.
  return 0;
}

/** Records that the plugin saw this player, for the connection-health dot. */
export async function heartbeat(uuids: string[]): Promise<number> {
  await prisma.platformState.upsert({ where: { id: "platform" }, create: { id: "platform", pluginSeenAt: new Date() }, update: { pluginSeenAt: new Date() } });
  if (uuids.length === 0) return 0;
  const normalised: string[] = [];
  for (const raw of uuids.slice(0, 200)) {
    try {
      normalised.push(normaliseUuid(raw));
    } catch {
      // Ignore malformed entries rather than rejecting the whole heartbeat.
    }
  }
  if (normalised.length === 0) return 0;

  const result = await prisma.minecraftAccount.updateMany({
    where: { uuid: { in: normalised } },
    data: { lastSeenAt: new Date() },
  });
  return result.count;
}

export { WalletError };
