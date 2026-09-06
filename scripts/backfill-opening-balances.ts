/**
 * One-off migration: give pre-existing accounts a ledger entry for the coins
 * they were created with.
 *
 * Accounts made before the signup grant was ledgered have a balance the ledger
 * cannot explain — `sum(transactions) + 1000 === balance` rather than
 * `sum(transactions) === balance`. That gap is harmless on its own but it
 * breaks the invariant every audit relies on, and "there is always a mystery
 * 1 000" is exactly the kind of tolerated discrepancy that hides a real one.
 *
 * This writes the missing SIGNUP_BONUS entry and nothing else. Balances are not
 * touched — the entry is recorded with the balances it must have had at the
 * time, so it reconciles without moving a single coin.
 *
 *   npx tsx --env-file-if-exists=.env scripts/backfill-opening-balances.ts          # dry run
 *   npx tsx --env-file-if-exists=.env scripts/backfill-opening-balances.ts --apply
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const OPENING_GRANT = 1_000;

async function main() {
  const wallets = await prisma.wallet.findMany({
    include: { user: { select: { id: true, username: true, createdAt: true } } },
  });

  let fixed = 0;
  let alreadyFine = 0;
  let unexplained = 0;

  for (const wallet of wallets) {
    const entries = await prisma.transaction.findMany({
      where: { userId: wallet.userId },
      select: { amount: true, type: true },
    });

    const sum = entries.reduce((total, entry) => total + entry.amount, 0);

    if (sum === wallet.balance) {
      alreadyFine += 1;
      continue;
    }

    const hasGrant = entries.some((entry) => entry.type === "SIGNUP_BONUS");
    if (hasGrant || sum + OPENING_GRANT !== wallet.balance) {
      // Not the known opening-grant gap. Report it and leave it alone — an
      // unexplained discrepancy is a thing to investigate, not to paper over.
      unexplained += 1;
      console.warn(
        `  ! ${wallet.user.username}: balance ${wallet.balance}, ledger ${sum}, ` +
          `gap ${wallet.balance - sum} — not the opening grant, skipping.`,
      );
      continue;
    }

    fixed += 1;
    console.log(`  ${APPLY ? "fixing" : "would fix"} ${wallet.user.username} (+${OPENING_GRANT})`);

    if (!APPLY) continue;

    // Backdated to the account's creation so history reads in the right order,
    // and written with before/after that match the moment it happened.
    await prisma.transaction.create({
      data: {
        userId: wallet.userId,
        type: "SIGNUP_BONUS",
        amount: OPENING_GRANT,
        balanceBefore: 0,
        balanceAfter: OPENING_GRANT,
        source: "signup",
        metadata: JSON.stringify({ reason: "Backfilled opening grant", backfilled: true }),
        createdAt: wallet.user.createdAt,
      },
    });
  }

  console.log(
    `\n${wallets.length} wallets: ${alreadyFine} already consistent, ` +
      `${fixed} ${APPLY ? "backfilled" : "needing backfill"}, ${unexplained} unexplained.`,
  );
  if (!APPLY && fixed > 0) console.log("Re-run with --apply to write the entries.");
  if (unexplained > 0) console.log("Investigate the unexplained wallets before trusting totals.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
