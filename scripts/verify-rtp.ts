/**
 * Monte Carlo check on the payout maths.
 *
 * Every wagering game should land within a hair of 99 % return (1 % retained
 * margin). Slots is weight-driven rather than formula-driven, so this is the
 * only reliable way to keep its paytable honest.
 *
 *   npx tsx scripts/verify-rtp.ts
 */
import { spinSlots } from "../src/lib/games/slots";
import { rollDice, diceMultiplier } from "../src/lib/games/dice";
import { minesMultiplier } from "../src/lib/games/mines";
import { crashPointFrom } from "../src/lib/games/crash";
import { stageSurvivalChance, LAST_HOPE_STAGES } from "../src/lib/games/lasthope";
import { fairStream, randomSeed } from "../src/server/rng";

const ROUNDS = Number(process.argv[2] ?? 400_000);
const BET = 1_000;

function pct(value: number) {
  return `${(value * 100).toFixed(3)} %`;
}

function heading(title: string) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// --- slots -----------------------------------------------------------------
heading(`Slots — ${ROUNDS.toLocaleString("en-US")} spins`);
{
  const serverSeed = randomSeed();
  let wagered = 0;
  let returned = 0;
  let hits = 0;
  let best = 0;
  for (let i = 0; i < ROUNDS; i += 1) {
    const rng = fairStream(serverSeed, "verify", i);
    const spin = spinSlots(rng, BET);
    wagered += BET;
    returned += spin.payout;
    if (spin.payout > 0) hits += 1;
    best = Math.max(best, spin.multiplier);
  }
  console.log(`  RTP          ${pct(returned / wagered)}`);
  console.log(`  Hit rate     ${pct(hits / ROUNDS)}`);
  console.log(`  Best spin    ${best.toFixed(2)}x`);
}

// --- dice ------------------------------------------------------------------
heading("Dice — analytic + simulated");
{
  const serverSeed = randomSeed();
  for (const [target, direction] of [
    [50, "under"],
    [10, "under"],
    [90, "over"],
    [95, "under"],
  ] as const) {
    let wagered = 0;
    let returned = 0;
    const sample = Math.min(ROUNDS, 200_000);
    for (let i = 0; i < sample; i += 1) {
      const rng = fairStream(serverSeed, `d${target}${direction}`, i);
      const roll = rollDice(rng, BET, target, direction);
      wagered += BET;
      returned += roll.payout;
    }
    console.log(
      `  ${direction.padEnd(5)} ${String(target).padStart(3)}  mult ${diceMultiplier(target, direction).toFixed(4)}x  RTP ${pct(returned / wagered)}`,
    );
  }
}

// --- mines -----------------------------------------------------------------
heading("Mines — analytic expected value");
{
  for (const mines of [1, 3, 5, 10, 24]) {
    const safe = 25 - mines;
    const picks = Math.min(safe, 3);
    // EV = P(survive picks) × multiplier
    let probability = 1;
    for (let i = 0; i < picks; i += 1) probability *= (safe - i) / (25 - i);
    const ev = probability * minesMultiplier(mines, picks);
    console.log(
      `  ${String(mines).padStart(2)} mines, ${picks} picks  mult ${minesMultiplier(mines, picks).toFixed(4)}x  EV ${pct(ev)}`,
    );
  }
}

// --- crash -----------------------------------------------------------------
heading(`Crash — ${ROUNDS.toLocaleString("en-US")} rounds`);
{
  const serverSeed = randomSeed();
  const targets = [1.5, 2, 5, 20];
  const returns = new Map(targets.map((t) => [t, 0]));
  let instantBusts = 0;
  for (let i = 0; i < ROUNDS; i += 1) {
    const rng = fairStream(serverSeed, "crash", i);
    const point = crashPointFrom(rng.next());
    if (point <= 1) instantBusts += 1;
    for (const target of targets) {
      if (point >= target) returns.set(target, returns.get(target)! + target);
    }
  }
  for (const target of targets) {
    console.log(`  auto ${String(target).padStart(4)}x   RTP ${pct(returns.get(target)! / ROUNDS)}`);
  }
  console.log(`  instant bust ${pct(instantBusts / ROUNDS)}`);
}

// --- last hope -------------------------------------------------------------
heading("Last Hope — analytic expected value per stopping stage");
{
  let cumulative = 1;
  for (const entry of LAST_HOPE_STAGES) {
    cumulative *= stageSurvivalChance(entry.stage);
    console.log(
      `  stage ${entry.stage}  ${entry.multiplier.toFixed(2)}x  survive ${pct(stageSurvivalChance(entry.stage))}  EV ${pct(cumulative * entry.multiplier)}`,
    );
  }
}

console.log("");
