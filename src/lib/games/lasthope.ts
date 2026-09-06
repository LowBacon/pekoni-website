import { HOUSE_EDGE } from "./config";

/**
 * Last Hope — the storm shrine.
 *
 * Five stages with fixed multipliers. The survival probability of each stage is
 * derived so that the cumulative expected value at *every* stage is exactly
 * 1 − HOUSE_EDGE. There is no stage where continuing is mathematically better
 * or worse than stopping, which keeps the choice purely dramatic.
 */

export const LAST_HOPE_STAGES = [
  { stage: 1, multiplier: 1.2, name: "Portaikko", weather: "drizzle" },
  { stage: 2, multiplier: 1.55, name: "Kivikaari", weather: "rain" },
  { stage: 3, multiplier: 2.2, name: "Uhrialttari", weather: "storm" },
  { stage: 4, multiplier: 3.5, name: "Kellotorni", weather: "gale" },
  { stage: 5, multiplier: 6.0, name: "Sydänkammio", weather: "tempest" },
] as const;

export const MAX_STAGE = LAST_HOPE_STAGES.length;

/** Cumulative probability of still standing after finishing `stage`. */
function cumulativeSurvival(stage: number): number {
  const entry = LAST_HOPE_STAGES[stage - 1];
  return (1 - HOUSE_EDGE) / entry.multiplier;
}

export function stageSurvivalChance(stage: number): number {
  if (stage < 1 || stage > MAX_STAGE) return 0;
  const after = cumulativeSurvival(stage);
  const before = stage === 1 ? 1 : cumulativeSurvival(stage - 1);
  return after / before;
}

export function stageMultiplier(stage: number): number {
  if (stage < 1) return 1;
  return LAST_HOPE_STAGES[Math.min(stage, MAX_STAGE) - 1].multiplier;
}

/**
 * All five outcomes are rolled when the round opens, so the server cannot be
 * influenced by how long the player deliberates.
 */
export function rollStages(stream: { next(): number }): boolean[] {
  return LAST_HOPE_STAGES.map((entry) => stream.next() < stageSurvivalChance(entry.stage));
}

export type LastHopeState = {
  survives: boolean[];
  stage: number; // stages already cleared
};
