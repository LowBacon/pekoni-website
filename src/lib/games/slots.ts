import type { FairStream } from "./types";

/**
 * The Pekoni excavation machine — 5 reels × 3 rows, 9 fixed paylines.
 *
 * Payline wins are expressed as a fraction of the *total* bet, so no fractional
 * line-bet arithmetic ever reaches the wallet. The Rune is wild and substitutes
 * for every symbol except itself. Weights and the paytable below were tuned
 * against a Monte Carlo run (see scripts/verify-rtp.ts) to land near 96 % RTP.
 */

export const SLOT_SYMBOLS = [
  { key: "coin", name: "Ancient Coin", weight: 22 },
  { key: "apple", name: "Enchanted Apple", weight: 20 },
  { key: "gold", name: "Gold Ingot", weight: 16 },
  { key: "emerald", name: "Emerald", weight: 13 },
  { key: "diamond", name: "Diamond", weight: 10 },
  { key: "creeper", name: "Creeper", weight: 8 },
  { key: "tnt", name: "TNT", weight: 6 },
  { key: "netherite", name: "Netherite", weight: 4 },
  { key: "rune", name: "Pekoni Rune", weight: 3 },
] as const;

export type SlotSymbolKey = (typeof SLOT_SYMBOLS)[number]["key"];

export const WILD: SlotSymbolKey = "rune";

/**
 * [three of a kind, four, five] as a multiple of the total bet.
 * Solved against measured line-hit frequencies — see scripts/tune-slots.ts.
 */
export const PAYTABLE: Record<SlotSymbolKey, [number, number, number]> = {
  coin: [0.6, 2.3, 9],
  apple: [0.8, 3.1, 12],
  gold: [1.25, 5, 20],
  emerald: [1.9, 7.75, 34],
  diamond: [3.1, 14, 62],
  creeper: [5, 23, 108],
  tnt: [8.5, 40, 200],
  netherite: [15.5, 85, 465],
  rune: [28, 170, 1080],
};

/** Row index per reel. Nine lines across a 5 × 3 grid. */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
];

const TOTAL_WEIGHT = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function pickSymbol(roll: number): SlotSymbolKey {
  let ticket = roll * TOTAL_WEIGHT;
  for (const symbol of SLOT_SYMBOLS) {
    ticket -= symbol.weight;
    if (ticket < 0) return symbol.key;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1].key;
}

export type SlotLineWin = {
  line: number;
  symbol: SlotSymbolKey;
  count: number;
  multiplier: number;
  /** [reel, row] cells to highlight. */
  cells: [number, number][];
};

/** Grid is indexed `grid[reel][row]`. */
export function evaluateGrid(grid: SlotSymbolKey[][]): {
  wins: SlotLineWin[];
  multiplier: number;
} {
  const wins: SlotLineWin[] = [];

  PAYLINES.forEach((rows, lineIndex) => {
    const symbols = rows.map((row, reel) => grid[reel][row]);

    // The paying symbol is the first non-wild; an all-wild run pays as rune.
    let target: SlotSymbolKey | null = null;
    for (const symbol of symbols) {
      if (symbol !== WILD) {
        target = symbol;
        break;
      }
    }
    if (target === null) target = WILD;

    let count = 0;
    for (const symbol of symbols) {
      if (symbol === target || symbol === WILD) count += 1;
      else break;
    }

    if (count < 3) return;

    const payout = PAYTABLE[target][count - 3];
    if (payout <= 0) return;

    wins.push({
      line: lineIndex,
      symbol: target,
      count,
      multiplier: payout,
      cells: rows.slice(0, count).map((row, reel) => [reel, row] as [number, number]),
    });
  });

  const multiplier = wins.reduce((sum, win) => sum + win.multiplier, 0);
  return { wins, multiplier: Math.round(multiplier * 10_000) / 10_000 };
}

export function spinSlots(rng: FairStream, bet: number) {
  const grid: SlotSymbolKey[][] = [];
  for (let reel = 0; reel < 5; reel += 1) {
    const column: SlotSymbolKey[] = [];
    for (let row = 0; row < 3; row += 1) column.push(pickSymbol(rng.next()));
    grid.push(column);
  }

  const { wins, multiplier } = evaluateGrid(grid);
  const payout = Math.floor(bet * multiplier);

  return { grid, wins, multiplier, payout };
}
