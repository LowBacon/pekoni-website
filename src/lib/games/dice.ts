import { HOUSE_EDGE } from "./config";
import type { FairStream } from "./types";

export const DICE_MIN_TARGET = 2;
export const DICE_MAX_TARGET = 98;

export type DiceDirection = "under" | "over";

export function diceWinChance(target: number, direction: DiceDirection): number {
  return direction === "under" ? target : 100 - target;
}

/** 99 / chance — a flat 1 % retained margin at every target. */
export function diceMultiplier(target: number, direction: DiceDirection): number {
  const chance = diceWinChance(target, direction);
  if (chance <= 0) return 0;
  return Math.floor(((100 - HOUSE_EDGE * 100) / chance) * 10_000) / 10_000;
}

export function validateDice(target: number, direction: string) {
  const value = Math.round(Number(target) * 100) / 100;
  if (!Number.isFinite(value) || value < DICE_MIN_TARGET || value > DICE_MAX_TARGET) {
    throw new Error(`Rajan tulee olla ${DICE_MIN_TARGET}–${DICE_MAX_TARGET}.`);
  }
  if (direction !== "under" && direction !== "over") {
    throw new Error("Virheellinen suunta.");
  }
  return { target: value, direction: direction as DiceDirection };
}

export function rollDice(
  rng: FairStream,
  bet: number,
  target: number,
  direction: DiceDirection,
) {
  // Two decimals of precision across 0.00–100.00.
  const roll = Math.floor(rng.next() * 10_001) / 100;
  const won = direction === "under" ? roll < target : roll > target;
  const multiplier = diceMultiplier(target, direction);
  const payout = won ? Math.floor(bet * multiplier) : 0;

  return {
    roll,
    won,
    multiplier: won ? multiplier : 0,
    payout,
    winChance: diceWinChance(target, direction),
  };
}
