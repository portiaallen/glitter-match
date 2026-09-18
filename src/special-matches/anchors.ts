import type { SpecialMatchCandidate } from "../matching/types.js";
import type { AnchorPolicy } from "./types.js";

/**
 * Graph-aware anchor selection. Never uses x/y, visual center, array index, or screen position.
 *
 * Algorithm (deterministic):
 * 1. authored-candidate — use the candidate's anchor if it is among affected cells
 * 2. match-created — same as authored when present, else canonical
 * 3. canonical-cell — lexicographically smallest affected cell id
 * 4. rule-selector — reserved; falls back to canonical unless metadata.anchorCellId is set
 */
export function selectAnchor(
  candidate: SpecialMatchCandidate,
  policy: AnchorPolicy,
  knownCellIds: readonly string[],
): { cellId: string; why: string } {
  const known = new Set(knownCellIds);
  const affected = candidate.affectedCellIds.filter((id) => known.has(id)).sort();
  if (affected.length === 0) {
    throw new Error("Cannot select a Special Match anchor: candidate has no valid graph cell ids.");
  }

  if ((policy === "authored-candidate" || policy === "match-created") && known.has(candidate.anchorCellId)) {
    return {
      cellId: candidate.anchorCellId,
      why: `Anchor policy "${policy}" used authored candidate anchor ${candidate.anchorCellId}.`,
    };
  }

  if (policy === "rule-selector" && candidate.anchorCellId && known.has(candidate.anchorCellId)) {
    return {
      cellId: candidate.anchorCellId,
      why: `Rule-specific selector provided anchor ${candidate.anchorCellId}.`,
    };
  }

  const canonical = affected[0]!;
  return {
    cellId: canonical,
    why: `Canonical graph anchor is the lexicographically first affected cell "${canonical}". Coordinates were not used.`,
  };
}

export function compareAnchors(a: string, b: string): number {
  return a.localeCompare(b);
}
