import type { RandomSource } from "../random/index.js";

export interface ControlledDraw {
  kind: "next" | "nextInt" | "pick";
  value: number | string;
}

/**
 * Mechanics that genuinely need randomness must declare it and use SeededRandom.
 * Do not use this to make puzzles feel chaotic.
 */
export function drawInt(rng: RandomSource, maxExclusive: number, log: ControlledDraw[]): number {
  const value = rng.nextInt(maxExclusive);
  log.push({ kind: "nextInt", value });
  return value;
}

export function drawPick<T>(rng: RandomSource, items: readonly T[], log: ControlledDraw[]): T {
  const value = rng.pick(items);
  log.push({ kind: "pick", value: String(value) });
  return value;
}
