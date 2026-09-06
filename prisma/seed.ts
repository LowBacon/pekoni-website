/**
 * Seeds the Pekoni world: cases, their loot tables and the achievement set.
 *
 * Case odds are not hand-waved. Every case declares a filler item whose weight
 * is *solved* so the case's expected value lands exactly on its target return
 * (95 % of the price). The script prints the resulting EV for each case so the
 * economy can be audited at a glance.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import {
  ACHIEVEMENT_SPECS,
  buildCaseItems,
  CASE_SPECS,
  DAILY_CASE_SPEC,
  type CaseSpec,
} from "../src/lib/content/world";

const prisma = new PrismaClient();

async function seedCase(spec: CaseSpec, sortOrder: number) {
  const items = buildCaseItems(spec);

  const record = await prisma.case.upsert({
    where: { slug: spec.slug },
    create: {
      slug: spec.slug,
      name: spec.name,
      tagline: spec.tagline,
      description: spec.description,
      price: spec.price,
      theme: spec.theme,
      kind: spec.kind ?? "STANDARD",
      sortOrder,
    },
    update: {
      name: spec.name,
      tagline: spec.tagline,
      description: spec.description,
      price: spec.price,
      theme: spec.theme,
      kind: spec.kind ?? "STANDARD",
      sortOrder,
      active: true,
    },
  });

  await prisma.caseItem.deleteMany({ where: { caseId: record.id } });
  await prisma.caseItem.createMany({
    data: items.map((item) => ({
      caseId: record.id,
      name: item.name,
      rarity: item.rarity,
      icon: item.icon,
      value: item.value,
      weight: item.weight,
    })),
  });

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const ev = items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
  const ratio = spec.price > 0 ? ev / spec.price : 0;

  return { name: spec.name, price: spec.price, ev, ratio, items: items.length, totalWeight };
}

async function main() {
  console.log("Seeding Pekoni…\n");

  const results = [];
  for (const [index, spec] of CASE_SPECS.entries()) {
    results.push(await seedCase(spec, index));
  }
  const daily = await seedCase(DAILY_CASE_SPEC, 100);

  console.log("Cases");
  console.log("  name              price        EV     return   items");
  for (const result of results) {
    console.log(
      `  ${result.name.padEnd(16)} ${String(result.price).padStart(6)} ${result.ev.toFixed(1).padStart(9)} ${(result.ratio * 100).toFixed(2).padStart(8)} % ${String(result.items).padStart(6)}`,
    );
  }
  console.log(`  ${daily.name.padEnd(16)} ${"free".padStart(6)} ${daily.ev.toFixed(1).padStart(9)} ${"—".padStart(9)} ${String(daily.items).padStart(7)}`);

  for (const achievement of ACHIEVEMENT_SPECS) {
    await prisma.achievement.upsert({
      where: { slug: achievement.slug },
      create: achievement,
      update: achievement,
    });
  }
  console.log(`\nAchievements      ${ACHIEVEMENT_SPECS.length} defined`);

  const users = await prisma.user.count();
  console.log(`Users             ${users} existing (none created by the seed)`);
  console.log("\nDone. Register the first account at /register.");
  if (process.env.PEKONI_OWNER_USERNAME) {
    console.log(`"${process.env.PEKONI_OWNER_USERNAME}" will be promoted to OWNER on registration.`);
  } else {
    console.log("Tip: set PEKONI_OWNER_USERNAME in .env to auto-promote your account to OWNER.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
