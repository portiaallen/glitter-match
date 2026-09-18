import type { AttemptRecord, BestResult, BestResultStrategy } from "./types.js";
import { issue, throwIfErrors } from "../validation.js";

export type BestResultComparator = (a: AttemptRecord, b: AttemptRecord) => number;

const STRATEGIES: Record<BestResultStrategy, BestResultComparator> = {
  "higher-score": (a, b) => a.score - b.score,
  "fewer-moves": (a, b) => b.moveCount - a.moveCount,
  "mastery-then-score": (a, b) => Number(a.mastered) - Number(b.mastered) || a.score - b.score,
};

export function getBestResultComparator(strategy: BestResultStrategy): BestResultComparator {
  const comparator = STRATEGIES[strategy];
  if (!comparator) {
    throwIfErrors(
      [issue("progression.unknown_best_strategy", "bestResult.strategy", `Unknown best-result strategy "${strategy}".`)],
      "Unknown best-result strategy",
    );
  }
  return comparator;
}

/** Positive means `candidate` is better. Equal results pick the lexicographically smaller attemptId. */
export function compareAttempts(strategy: BestResultStrategy, candidate: AttemptRecord, incumbent: AttemptRecord): number {
  const delta = getBestResultComparator(strategy)(candidate, incumbent);
  if (delta !== 0) {
    return delta;
  }
  return incumbent.attemptId.localeCompare(candidate.attemptId);
}

export function selectBestResult(strategy: BestResultStrategy, attempts: AttemptRecord[]): BestResult | undefined {
  const completed = attempts.filter((attempt) => attempt.completed);
  if (completed.length === 0) {
    return undefined;
  }
  const best = completed.reduce((incumbent, candidate) => (compareAttempts(strategy, candidate, incumbent) > 0 ? candidate : incumbent));
  return {
    attemptId: best.attemptId,
    strategy,
    score: best.score,
    movesUsed: best.moveCount,
    mastered: best.mastered,
    contentVersion: best.contentVersion,
  };
}

export function isBetterResult(strategy: BestResultStrategy, candidate: AttemptRecord, incumbent?: BestResult): boolean {
  if (!incumbent) {
    return candidate.completed;
  }
  const asAttempt: AttemptRecord = {
    attemptId: incumbent.attemptId,
    levelId: candidate.levelId,
    contentVersion: incumbent.contentVersion,
    moveCount: incumbent.movesUsed,
    score: incumbent.score,
    outcome: "completed",
    completed: true,
    mastered: incumbent.mastered,
  };
  return compareAttempts(strategy, candidate, asAttempt) > 0;
}
