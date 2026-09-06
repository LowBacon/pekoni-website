import "server-only";
import { prisma, type Tx } from "./db";
import { fairWeightedPick } from "./rng";
import { applyLedgerEntry, claimIdempotencyKey, storeIdempotentResult } from "./wallet";
import {
  awardXp,
  pushActivity,
  recordAchievementProgress,
  updateStats,
  type UnlockedAchievement,
} from "./progression";
import { XP_RULES } from "@/lib/progression";
import type { Rarity } from "@/lib/enums";

export type DrawnItem = {
  id: string;
  name: string;
  rarity: Rarity;
  icon: string;
  value: number;
};

/**
 * Picks a case item from the fair stream. The reel the client animates is
 * cosmetic — the landing item is decided here, before any pixels move.
 */
export function drawItem(
  items: { id: string; name: string; rarity: string; icon: string; value: number; weight: number }[],
  roll: number,
): DrawnItem {
  const picked = fairWeightedPick(items, roll);
  return {
    id: picked.id,
    name: picked.name,
    rarity: picked.rarity as Rarity,
    icon: picked.icon,
    value: picked.value,
  };
}

export type CaseOpenResult = {
  balance: number;
  item: DrawnItem;
  cost: number;
  profit: number;
  openingId: string;
  /** Reel strip the client scrolls through; the winner sits at `winningIndex`. */
  reel: DrawnItem[];
  winningIndex: number;
  level: number;
  leveledUp: boolean;
  unlocked: UnlockedAchievement[];
};

/** Up to this many cases in one action. */
export const MAX_MULTI_OPEN = 3;

export type CaseBatchResult = {
  /** One entry per case opened, in draw order. */
  opens: CaseOpenResult[];
  /** Balance once every purchase and reward in the batch has settled. */
  balance: number;
  count: number;
  totalCost: number;
  totalValue: number;
  totalProfit: number;
};

const REEL_LENGTH = 60;
const WINNING_INDEX = 52;

/** Builds the visual strip. Decoration only — never influences the outcome. */
function buildReel(
  items: { id: string; name: string; rarity: string; icon: string; value: number; weight: number }[],
  winner: DrawnItem,
  rng: { next(): number },
): DrawnItem[] {
  const reel: DrawnItem[] = [];
  for (let i = 0; i < REEL_LENGTH; i += 1) {
    reel.push(i === WINNING_INDEX ? winner : drawItem(items, rng.next()));
  }
  return reel;
}

/**
 * Opens one or more cases in a single atomic action.
 *
 * Each case in the batch is a genuinely independent draw at its own nonce, so
 * every one of them stays individually verifiable afterwards — a batch is not
 * one roll copied three times, and the fairness page can check any of them on
 * its own.
 *
 * The whole batch settles or none of it does. A player who can afford two of
 * three gets a refusal rather than two cases and an error: the second debit
 * fails the conditional balance check and the transaction rolls back, leaving
 * no half-finished purchase to reconcile.
 */
export async function openCases(input: {
  userId: string;
  caseId: string;
  count?: number;
  idempotencyKey?: string;
}): Promise<CaseBatchResult> {
  return prisma.$transaction(
    async (tx) => {
      if (input.idempotencyKey) {
        const claim = await claimIdempotencyKey(tx, input.idempotencyKey, input.userId, "case:open");
        if (!claim.fresh) return claim.result as CaseBatchResult;
      }

      const count = Math.min(MAX_MULTI_OPEN, Math.max(1, Math.trunc(input.count ?? 1)));

      const theCase = await tx.case.findUnique({
        where: { id: input.caseId },
        include: { items: true },
      });
      if (!theCase || !theCase.active) throw new Error("Casea ei löytynyt.");
      if (theCase.kind === "DAILY") throw new Error("Daily Case avataan omalta sivultaan.");
      if (theCase.items.length === 0) throw new Error("Case on tyhjä.");

      /*
        One nonce per case, reserved in a single update.

        Incrementing by `count` hands back the highest nonce in the batch, so
        the draws occupy `first .. first + count - 1`. Reserving them together
        rather than one at a time is what stops two concurrent batches from
        interleaving onto the same nonce and producing two identical draws.
      */
      const user = await tx.user.update({
        where: { id: input.userId },
        data: { nonce: { increment: count } },
        select: { serverSeed: true, clientSeed: true, nonce: true },
      });
      const firstNonce = user.nonce - count + 1;

      const { fairStream } = await import("./rng");
      const opens: CaseOpenResult[] = [];
      let totalCost = 0;
      let totalValue = 0;

      for (let index = 0; index < count; index += 1) {
        // Purchase and reward stay paired per case, so the ledger reads as
        // `count` ordinary openings rather than one lump nobody can attribute.
        await applyLedgerEntry(tx, input.userId, {
          type: "CASE_PURCHASE",
          amount: theCase.price,
          source: `case:${theCase.slug}`,
          metadata: { caseId: theCase.id, batchIndex: index, batchSize: count },
        });

        const rng = fairStream(user.serverSeed, user.clientSeed, firstNonce + index);
        const item = drawItem(theCase.items, rng.next());
        const reel = buildReel(theCase.items, item, rng);

        if (item.value > 0) {
          await applyLedgerEntry(tx, input.userId, {
            type: "CASE_REWARD",
            amount: item.value,
            source: `case:${theCase.slug}`,
            metadata: { itemId: item.id, rarity: item.rarity, batchIndex: index },
          });
        }

        const opening = await tx.caseOpening.create({
          data: {
            userId: input.userId,
            caseId: theCase.id,
            itemId: item.id,
            cost: theCase.price,
            value: item.value,
            source: "SHOP",
          },
          select: { id: true },
        });

        const profit = item.value - theCase.price;
        totalCost += theCase.price;
        totalValue += item.value;

        opens.push({
          balance: 0, // filled in below, once the whole batch has settled
          item,
          cost: theCase.price,
          profit,
          openingId: opening.id,
          reel,
          winningIndex: WINNING_INDEX,
          level: 0,
          leveledUp: false,
          unlocked: [],
        });
      }

      const best = opens.reduce((a, b) => (b.profit > a.profit ? b : a));

      await updateStats(tx, input.userId, {
        casesOpened: count,
        biggestWin: best.profit > 0 ? best.profit : 0,
      });

      const xp = await awardXp(tx, input.userId, XP_RULES.caseOpen * count);

      const rareCount = opens.filter(
        (o) => o.item.rarity === "LEGENDARY" || o.item.rarity === "MYTHIC",
      ).length;

      const unlocked = await recordAchievementProgress(tx, input.userId, [
        { slug: "case-collector", value: count, mode: "increment" },
        ...(rareCount > 0
          ? [{ slug: "lucky", value: rareCount, mode: "increment" as const }]
          : []),
      ]);

      // One feed line per batch. Three separate lines for one action would
      // crowd out everybody else in the public feed.
      await pushActivity(tx, input.userId, {
        kind: "CASE_OPEN",
        label:
          count === 1
            ? `avasi ${theCase.name} — ${best.item.name}`
            : `avasi ${count}× ${theCase.name} — paras ${best.item.name}`,
        amount: totalValue,
        rarity: best.item.rarity,
      });

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });

      for (const open of opens) {
        open.balance = wallet.balance;
        open.level = xp.level;
        open.leveledUp = xp.leveledUp;
      }
      opens[opens.length - 1].unlocked = unlocked;

      const response: CaseBatchResult = {
        opens,
        balance: wallet.balance,
        count,
        totalCost,
        totalValue,
        totalProfit: totalValue - totalCost,
      };

      if (input.idempotencyKey) {
        await storeIdempotentResult(tx, input.idempotencyKey, response);
      }

      return response;
    },
    { timeout: 15_000 },
  );
}

/** Aggregate odds shown on the case page. Derived from the live item weights. */
export function rarityOdds(
  items: { rarity: string; weight: number }[],
): { rarity: Rarity; chance: number }[] {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const grouped = new Map<string, number>();
  for (const item of items) {
    grouped.set(item.rarity, (grouped.get(item.rarity) ?? 0) + item.weight);
  }
  return [...grouped.entries()]
    .map(([rarity, weight]) => ({ rarity: rarity as Rarity, chance: weight / total }))
    .sort((a, b) => b.chance - a.chance);
}

export function expectedValue(items: { value: number; weight: number }[]): number {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (total === 0) return 0;
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / total;
}

/** Used by the daily case so it shares one draw implementation. */
export async function drawFromCaseSlug(tx: Tx, slug: string, roll: number) {
  const theCase = await tx.case.findUnique({ where: { slug }, include: { items: true } });
  if (!theCase || theCase.items.length === 0) throw new Error("Casea ei löytynyt.");
  return { case: theCase, item: drawItem(theCase.items, roll) };
}
