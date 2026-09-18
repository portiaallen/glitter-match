import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { runMatchResolution } from "./pipeline.js";
import type { MatchDetectionContext, MatchGroup, MatchRules } from "./types.js";

/**
 * Cascade-facing match detection. Implemented by the match-resolution pipeline.
 * Does not run cascade, refill, or Special Match creation.
 */
export function detectMatches(
  board: Board,
  rules: MatchRules,
  registry: IconRegistry,
  context?: MatchDetectionContext,
): MatchGroup[] {
  return runMatchResolution(board, rules, registry, context).groups;
}

export function matchedCellIds(groups: MatchGroup[]): CellId[] {
  return [...new Set(groups.flatMap((group) => group.cellIds))].sort();
}
