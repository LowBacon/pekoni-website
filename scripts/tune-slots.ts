/**
 * Measures how often each (symbol, count) payline event occurs, then solves for
 * the paytable that hits a target RTP with a chosen payout shape.
 *
 *   npx tsx scripts/tune-slots.ts [spins] [targetRtp]
 */
import { SLOT_SYMBOLS, PAYLINES, WILD, type SlotSymbolKey } from "../src/lib/games/slots";
import { fairStream, randomSeed } from "../src/server/rng";

const SPINS = Number(process.argv[2] ?? 2_000_000);
const TARGET = Number(process.argv[3] ?? 0.96);

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((s, x) => s + x.weight, 0);
function pick(roll: number): SlotSymbolKey {
  let t = roll * TOTAL_WEIGHT;
  for (const s of SLOT_SYMBOLS) {
    t -= s.weight;
    if (t < 0) return s.key;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].key;
}

const counts = new Map<string, number>();
const seed = randomSeed();
let spinsWithWin = 0;

for (let i = 0; i < SPINS; i += 1) {
  const rng = fairStream(seed, "tune", i);
  const grid: SlotSymbolKey[][] = [];
  for (let reel = 0; reel < 5; reel += 1) {
    const col: SlotSymbolKey[] = [];
    for (let row = 0; row < 3; row += 1) col.push(pick(rng.next()));
    grid.push(col);
  }
  let won = false;
  for (const rows of PAYLINES) {
    const symbols = rows.map((row, reel) => grid[reel][row]);
    let target: SlotSymbolKey | null = null;
    for (const s of symbols) if (s !== WILD) { target = s; break; }
    if (target === null) target = WILD;
    let c = 0;
    for (const s of symbols) { if (s === target || s === WILD) c += 1; else break; }
    if (c >= 3) {
      counts.set(`${target}:${c}`, (counts.get(`${target}:${c}`) ?? 0) + 1);
      won = true;
    }
  }
  if (won) spinsWithWin += 1;
}

/** Relative payout shape, in "line units". Scaled uniformly to hit TARGET. */
const SHAPE: Record<SlotSymbolKey, [number, number, number]> = {
  coin: [4, 15, 60],
  apple: [5, 20, 80],
  gold: [8, 32, 130],
  emerald: [12, 50, 220],
  diamond: [20, 90, 400],
  creeper: [32, 150, 700],
  tnt: [55, 260, 1_300],
  netherite: [100, 550, 3_000],
  rune: [180, 1_100, 7_000],
};

let raw = 0;
for (const [key, n] of counts) {
  const [symbol, c] = key.split(":");
  raw += (n / SPINS) * SHAPE[symbol as SlotSymbolKey][Number(c) - 3];
}

const scale = TARGET / raw;

console.log(`spins            ${SPINS.toLocaleString("en-US")}`);
console.log(`hit rate         ${((spinsWithWin / SPINS) * 100).toFixed(3)} %`);
console.log(`raw shape RTP    ${(raw * 100).toFixed(3)} %`);
console.log(`scale factor     ${scale.toFixed(6)}`);
console.log(`\n// RTP ${(TARGET * 100).toFixed(1)} % — as a multiple of the total bet`);
console.log("export const PAYTABLE: Record<SlotSymbolKey, [number, number, number]> = {");

let check = 0;
const contributions: [string, number][] = [];
for (const symbol of SLOT_SYMBOLS) {
  const values = SHAPE[symbol.key].map((v) => {
    const scaled = v * scale;
    // Round to a readable 3 significant figures.
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(scaled, 1e-6))) - 2);
    return Math.round(scaled / magnitude) * magnitude;
  });
  let contribution = 0;
  for (let c = 3; c <= 5; c += 1) {
    const n = counts.get(`${symbol.key}:${c}`) ?? 0;
    contribution += (n / SPINS) * values[c - 3];
  }
  check += contribution;
  contributions.push([symbol.key, contribution]);
  console.log(`  ${symbol.key}: [${values.map((v) => Number(v.toFixed(4))).join(", ")}],`);
}
console.log("};");

console.log(`\nrounded RTP      ${(check * 100).toFixed(3)} %`);
console.log("\nRTP contribution by symbol:");
for (const [key, value] of contributions.sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.padEnd(10)} ${((value / check) * 100).toFixed(1).padStart(5)} %`);
}
