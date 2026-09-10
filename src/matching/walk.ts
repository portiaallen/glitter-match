import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { canJoinIconSequence, matchableIcon, matchNeighbors } from "./occupancy.js";
import type { MatchCompatibilityDecision, MatchEdgeStep, MatchExplain } from "./types.js";

export interface PatternWalk {
  start: CellId;
  cellIds: CellId[];
  visited: Set<CellId>;
  edgesTraversed: MatchEdgeStep[];
  directionsUsed: string[];
  occupantCompatibility: MatchCompatibilityDecision[];
  rejectedCandidates: Array<{ cellId: string; reason: string }>;
}

export function beginWalk(start: CellId, startIcon: string): PatternWalk {
  return {
    start,
    cellIds: [start],
    visited: new Set([start]),
    edgesTraversed: [],
    directionsUsed: [],
    occupantCompatibility: [{ cellId: start, iconId: startIcon, accepted: true, reason: "walk origin" }],
    rejectedCandidates: [],
  };
}

export interface WalkStepOptions {
  allowedDirections?: readonly string[];
  requireMatchPermission?: boolean;
  preventInvalidCycles?: boolean;
  maxVisitedPerWalk?: number;
}

export type WalkStepResult =
  | { ok: true; next: CellId; direction?: string }
  | { ok: false; reason: string; cellId?: CellId };

/**
 * Advance a walk along authored directed edges. Coordinates are ignored.
 */
export function tryStepWalk(
  board: Board,
  walk: PatternWalk,
  registry: IconRegistry,
  iconsSoFar: string[],
  options: WalkStepOptions = {},
): WalkStepResult {
  const current = walk.cellIds[walk.cellIds.length - 1]!;
  if (options.maxVisitedPerWalk && walk.cellIds.length >= options.maxVisitedPerWalk) {
    return { ok: false, reason: `walk exceeded maxVisitedPerWalk (${options.maxVisitedPerWalk})` };
  }
  const candidates = matchNeighbors(board, current, options.allowedDirections);
  for (const candidate of candidates) {
    if (walk.visited.has(candidate.to)) {
      if (options.preventInvalidCycles !== false) {
        walk.rejectedCandidates.push({ cellId: candidate.to, reason: "already visited (cycle prevented)" });
        continue;
      }
    }
    const icon = matchableIcon(board, candidate.to);
    if (!icon) {
      walk.rejectedCandidates.push({ cellId: candidate.to, reason: "occupant cannot participate" });
      continue;
    }
    if (!canJoinIconSequence(iconsSoFar, icon, registry)) {
      walk.occupantCompatibility.push({
        cellId: candidate.to,
        iconId: icon,
        accepted: false,
        reason: "incompatible with walk color",
      });
      walk.rejectedCandidates.push({ cellId: candidate.to, reason: `incompatible occupant "${icon}"` });
      continue;
    }
    return { ok: true, next: candidate.to, direction: candidate.direction };
  }
  return { ok: false, reason: "no compatible authored neighbor" };
}

export function commitStep(walk: PatternWalk, next: CellId, icon: string, direction?: string): void {
  const from = walk.cellIds[walk.cellIds.length - 1]!;
  walk.cellIds.push(next);
  walk.visited.add(next);
  walk.edgesTraversed.push({ from, to: next, direction });
  if (direction && !walk.directionsUsed.includes(direction)) {
    walk.directionsUsed.push(direction);
  }
  walk.occupantCompatibility.push({
    cellId: next,
    iconId: icon,
    accepted: true,
    reason: direction ? `joined via authored direction "${direction}"` : "joined via authored match edge",
  });
}

export function walkSameDirection(
  board: Board,
  start: CellId,
  direction: string,
  registry: IconRegistry,
  options?: { maxVisitedPerWalk?: number },
): PatternWalk | null {
  const startIcon = matchableIcon(board, start);
  if (!startIcon) {
    return null;
  }
  const walk = beginWalk(start, startIcon);
  const icons = [startIcon];
  while (true) {
    if (options?.maxVisitedPerWalk && walk.cellIds.length >= options.maxVisitedPerWalk) {
      break;
    }
    const current = walk.cellIds[walk.cellIds.length - 1]!;
    const next = (board.topology.directed[current] ?? []).find(
      (edge) => edge.direction === direction && edge.allowsMatch && !walk.visited.has(edge.to),
    );
    if (!next) {
      break;
    }
    const nextIcon = matchableIcon(board, next.to);
    if (!nextIcon) {
      walk.rejectedCandidates.push({ cellId: next.to, reason: "occupant cannot participate" });
      break;
    }
    if (!canJoinIconSequence(icons, nextIcon, registry)) {
      walk.rejectedCandidates.push({ cellId: next.to, reason: `incompatible occupant "${nextIcon}"` });
      walk.occupantCompatibility.push({
        cellId: next.to,
        iconId: nextIcon,
        accepted: false,
        reason: "incompatible with walk color",
      });
      break;
    }
    commitStep(walk, next.to, nextIcon, direction);
    icons.push(nextIcon);
  }
  return walk;
}

export function explainFromWalk(
  walk: PatternWalk,
  ruleId: string,
  patternId: string,
  outcome: "matched" | "failed",
  summary: string,
  colorIconId?: string,
): MatchExplain {
  return {
    ruleId,
    patternId,
    startingCell: walk.start,
    traversedCells: [...walk.cellIds],
    edgesTraversed: [...walk.edgesTraversed],
    directionsUsed: [...walk.directionsUsed],
    occupantCompatibility: [...walk.occupantCompatibility],
    rejectedCandidates: [...walk.rejectedCandidates],
    finalMatchedCells: outcome === "matched" ? [...walk.cellIds] : [],
    outcome,
    summary: colorIconId ? `${summary} color=${colorIconId}` : summary,
  };
}
