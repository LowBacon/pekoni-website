import "server-only";
import { prisma } from "./db";
import { applyLedgerEntry } from "./wallet";
import { pushNotification } from "./progression";
import { hasRole, ROLES, type Role } from "@/lib/enums";
import { levelFromXp } from "@/lib/progression";

/**
 * Administration.
 *
 * Every function here re-checks the actor's role against the database rather
 * than trusting anything the caller passed in, and every state change writes an
 * audit row inside the same transaction as the change itself. Nothing in the
 * admin UI is load-bearing for permissions.
 */

export class AdminError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const ADMIN_ACTIONS = [
  "ADD_COINS",
  "REMOVE_COINS",
  "SUSPEND",
  "RESTORE",
  "RESET_DAILY_COOLDOWN",
  "SET_ROLE",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** Actions only an OWNER may take. */
const OWNER_ONLY: AdminAction[] = ["SET_ROLE"];
/** Actions that require full ADMIN rather than MODERATOR. */
const ADMIN_ONLY: AdminAction[] = ["ADD_COINS", "REMOVE_COINS"];

export const MAX_ADJUSTMENT = 10_000_000;

async function assertCanAct(actorId: string, action: AdminAction, targetId: string | null) {
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (actor.status !== "ACTIVE") throw new AdminError("Tilisi ei ole aktiivinen.", 403);

  if (OWNER_ONLY.includes(action) && !hasRole(actor.role, "OWNER")) {
    throw new AdminError("Vain omistaja voi tehdä tämän.", 403);
  }
  if (ADMIN_ONLY.includes(action) && !hasRole(actor.role, "ADMIN")) {
    throw new AdminError("Tämä toiminto vaatii Admin-oikeudet.", 403);
  }
  if (!hasRole(actor.role, "MODERATOR")) throw new AdminError("Ei käyttöoikeutta.", 403);

  if (targetId) {
    if (targetId === actorId && (action === "SUSPEND" || action === "SET_ROLE")) {
      throw new AdminError("Et voi kohdistaa tätä toimintoa itseesi.", 400);
    }
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (!target) throw new AdminError("Käyttäjää ei löytynyt.", 404);
    // Nobody may act on someone at or above their own rank.
    if (hasRole(target.role, actor.role as Role) && !hasRole(actor.role, "OWNER")) {
      throw new AdminError("Et voi hallita samanarvoista tai korkeampaa käyttäjää.", 403);
    }
  }

  return actor.role as Role;
}

export type AdminActionInput = {
  actorId: string;
  action: AdminAction;
  targetId: string;
  amount?: number;
  reason?: string;
  role?: Role;
};

export async function performAdminAction(input: AdminActionInput) {
  const actorRole = await assertCanAct(input.actorId, input.action, input.targetId);
  const reason = (input.reason ?? "").trim().slice(0, 300);

  if (!reason) throw new AdminError("Anna muutokselle perustelu.");
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUniqueOrThrow({
      where: { id: input.targetId },
      select: { id: true, username: true, role: true, status: true },
    });

    let summary = "";
    const metadata: Record<string, unknown> = { reason, actorRole, previous: { role: target.role, status: target.status } };

    switch (input.action) {
      case "ADD_COINS":
      case "REMOVE_COINS": {
        const amount = Math.trunc(Math.abs(Number(input.amount ?? 0)));
        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_ADJUSTMENT) {
          throw new AdminError(`Summan tulee olla 1–${MAX_ADJUSTMENT.toLocaleString("fi-FI")}.`);
        }
        const signed = input.action === "ADD_COINS" ? amount : -amount;

        await applyLedgerEntry(tx, target.id, {
          type: "ADMIN_ADJUSTMENT",
          amount: signed,
          source: `admin:${input.actorId}`,
          metadata: { reason: reason || null },
        });

        await pushNotification(tx, target.id, {
          kind: input.action === "ADD_COINS" ? "REWARD" : "INFO",
          title: input.action === "ADD_COINS" ? "Coineja lisätty" : "Coineja poistettu",
          body: reason || `${signed > 0 ? "+" : "−"}${amount} coins ylläpidon toimesta.`,
          href: "/profile",
        });

        metadata.amount = signed;
        summary = `${input.action === "ADD_COINS" ? "Lisäsi" : "Poisti"} ${amount} coins käyttäjälle ${target.username}`;
        break;
      }

      case "SUSPEND": {
        if (target.status === "SUSPENDED") throw new AdminError("Tili on jo jäädytetty.");
        await tx.user.update({ where: { id: target.id }, data: { status: "SUSPENDED" } });
        // Revoking sessions makes the suspension take effect immediately.
        await tx.session.deleteMany({ where: { userId: target.id } });
        summary = `Jäädytti käyttäjän ${target.username}`;
        break;
      }

      case "RESTORE": {
        if (target.status === "ACTIVE") throw new AdminError("Tili on jo aktiivinen.");
        await tx.user.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
        await pushNotification(tx, target.id, {
          kind: "SUCCESS",
          title: "Tili palautettu",
          body: reason || "Tilisi on jälleen käytössä.",
        });
        summary = `Palautti käyttäjän ${target.username}`;
        break;
      }

      case "RESET_DAILY_COOLDOWN": {
        const last = await tx.dailyReward.findFirst({
          where: { userId: target.id },
          orderBy: { claimedAt: "desc" },
        });
        if (!last) throw new AdminError("Käyttäjällä ei ole Daily Case -historiaa.");
        // Backdate the last claim rather than deleting it, so the ledger and the
        // reward history stay intact.
        await tx.dailyReward.update({
          where: { id: last.id },
          data: { claimedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
        });
        await pushNotification(tx, target.id, {
          kind: "REWARD",
          title: "Daily Case on avattavissa",
          body: "Ylläpito nollasi odotusajan.",
          href: "/daily-case",
        });
        summary = `Nollasi Daily Case -odotusajan käyttäjältä ${target.username}`;
        break;
      }

      case "SET_ROLE": {
        const role = input.role;
        if (!role || !ROLES.includes(role)) throw new AdminError("Virheellinen rooli.");
        if (role === "OWNER") throw new AdminError("Omistajan roolia ei voi myöntää käyttöliittymästä.");
        await tx.user.update({ where: { id: target.id }, data: { role } });
        metadata.role = role;
        summary = `Asetti käyttäjän ${target.username} rooliksi ${role}`;
        break;
      }
    }

    // Names are stored alongside the ids: the relations null out when an
    // account is deleted, and a log entry that cannot say who acted is not an
    // audit trail.
    const actor = await tx.user.findUnique({
      where: { id: input.actorId },
      select: { username: true },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorName: actor?.username ?? "(deleted)",
        targetId: target.id,
        targetName: target.username,
        action: input.action,
        summary,
        metadata: JSON.stringify(metadata),
      },
    });

    return { summary };
  });
}

export async function searchUsers(query: string, limit = 25) {
  const term = query.trim();
  const users = await prisma.user.findMany({
    where: term
      ? {
          OR: [
            { usernameLower: { contains: term.toLowerCase() } },
            { email: { contains: term.toLowerCase() } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { wallet: true, stats: true },
  });

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    minecraftUsername: user.minecraftUsername,
    balance: user.wallet?.balance ?? 0,
    level: levelFromXp(user.xp).level,
    gamesPlayed: user.stats?.gamesPlayed ?? 0,
    totalWagered: user.stats?.totalWagered ?? 0,
    createdAt: user.createdAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
  }));
}

export async function auditLog(limit = 60) {
  const rows = await prisma.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { username: true } },
      target: { select: { username: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    summary: row.summary,
    actor: row.actor?.username ?? row.actorName,
    target: row.target?.username ?? row.targetName ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function adminOverview() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [users, dau, wau, suspended, rounds24, coinsInCirculation, openBattles, casesOpened] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastSeenAt: { gte: dayAgo } } }),
      prisma.user.count({ where: { lastSeenAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.gameRound.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.caseBattle.count({ where: { status: { in: ["WAITING", "RUNNING"] } } }),
      prisma.caseOpening.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);

  return {
    users,
    dau,
    wau,
    suspended,
    rounds24,
    coinsInCirculation: coinsInCirculation._sum.balance ?? 0,
    openBattles,
    casesOpened,
  };
}

export async function popularGames(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.gameRound.groupBy({
    by: ["game"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { bet: true, payout: true },
  });

  return rows
    .map((row) => ({
      game: row.game,
      rounds: row._count._all,
      wagered: row._sum.bet ?? 0,
      payout: row._sum.payout ?? 0,
      hold: (row._sum.bet ?? 0) - (row._sum.payout ?? 0),
      rtp: (row._sum.bet ?? 0) > 0 ? (row._sum.payout ?? 0) / (row._sum.bet ?? 1) : 0,
    }))
    .sort((a, b) => b.rounds - a.rounds);
}

/** Daily wager/payout series for the admin chart. */
export async function economySeries(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);

  const rounds = await prisma.gameRound.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, bet: true, payout: true },
  });

  const buckets = new Map<string, { wagered: number; payout: number; rounds: number }>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    buckets.set(day.toISOString().slice(0, 10), { wagered: 0, payout: 0, rounds: 0 });
  }

  for (const round of rounds) {
    const key = round.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.wagered += round.bet;
    bucket.payout += round.payout;
    bucket.rounds += 1;
  }

  return [...buckets.entries()].map(([date, value]) => ({ date, ...value }));
}
