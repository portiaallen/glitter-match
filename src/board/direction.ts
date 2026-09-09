import type { CellId, DirectionLabel } from "../ids.js";
import type { Board, DirectedEntry, EdgeDefinition, EdgeTraversal } from "./types.js";

/**
 * Authored reverse labels. These are vocabulary on edges, not screen axes.
 * Unknown labels reverse as `rev:<label>` so designers can invent orientations.
 */
const REVERSE_TABLE: Record<string, string> = {
  n: "s",
  s: "n",
  e: "w",
  w: "e",
  ne: "sw",
  sw: "ne",
  nw: "se",
  se: "nw",
  up: "down",
  down: "up",
  cw: "ccw",
  ccw: "cw",
  in: "out",
  out: "in",
  forward: "back",
  back: "forward",
};

export function reverseDirection(direction: string): string {
  return REVERSE_TABLE[direction] ?? `rev:${direction}`;
}

export function resolveTraversal(edge: Pick<EdgeDefinition, "traversal" | "bidirectional">): EdgeTraversal {
  if (edge.traversal) {
    return edge.traversal;
  }
  if (edge.bidirectional === false) {
    return "forward";
  }
  return "both";
}

export function edgeAllowsMatch(edge: Pick<EdgeDefinition, "allowsMatch">): boolean {
  return edge.allowsMatch !== false;
}

export function edgeAllowsSwap(edge: Pick<EdgeDefinition, "allowsSwap">): boolean {
  return edge.allowsSwap !== false;
}

export function remapDirectionLabel(direction: string | undefined, map: Record<string, string>): string | undefined {
  if (!direction) {
    return direction;
  }
  return map[direction] ?? direction;
}

/** Default 90° compass remap for authored direction labels. Not derived from x/y. */
export const DEFAULT_QUARTER_TURN_DIRECTION_MAP: Record<string, string> = {
  n: "e",
  ne: "se",
  e: "s",
  se: "sw",
  s: "w",
  sw: "nw",
  w: "n",
  nw: "ne",
  up: "e",
  down: "w",
};

export function applyDirectionMap(
  direction: string | undefined,
  map: Record<string, string>,
  steps: number,
): string | undefined {
  if (!direction) {
    return direction;
  }
  const count = Math.abs(steps);
  const forward = steps >= 0;
  let current = direction;
  for (let i = 0; i < count; i += 1) {
    if (forward) {
      current = map[current] ?? current;
    } else {
      const inverse = Object.entries(map).find(([, value]) => value === current)?.[0];
      current = inverse ?? current;
    }
  }
  return current;
}

/**
 * Walk a single authored direction label from `start`.
 * Visual coordinates are ignored; only `directed[].direction` matters.
 */
export function walkAuthoredDirection(
  board: Board,
  start: CellId,
  direction: DirectionLabel,
  options?: { requireMatchPermission?: boolean },
): DirectedEntry[] {
  const steps: DirectedEntry[] = [];
  const visited = new Set<CellId>([start]);
  let current = start;
  const requireMatch = options?.requireMatchPermission ?? true;

  while (true) {
    const next = (board.topology.directed[current] ?? []).find((edge) => {
      if (edge.direction !== direction) {
        return false;
      }
      if (requireMatch && !edge.allowsMatch) {
        return false;
      }
      return !visited.has(edge.to);
    });
    if (!next) {
      break;
    }
    steps.push(next);
    visited.add(next.to);
    current = next.to;
  }
  return steps;
}

export function cellsAlongAuthoredDirection(
  board: Board,
  start: CellId,
  direction: DirectionLabel,
): CellId[] {
  return [start, ...walkAuthoredDirection(board, start, direction).map((edge) => edge.to)];
}

export type AuthoredPatternKind = "line" | "corner" | "tee" | "cross";

export interface AuthoredPattern {
  kind: AuthoredPatternKind;
  pivot: CellId;
  cellIds: CellId[];
  directions: DirectionLabel[];
}

/**
 * Junction patterns (L / T / cross) are counts of distinct authored direction
 * rays from a pivot. This is graph structure, not bitmap geometry.
 */
export function detectAuthoredJunction(board: Board, pivot: CellId, minRayCells = 2): AuthoredPattern | null {
  const directions = [
    ...new Set(
      (board.topology.directed[pivot] ?? [])
        .filter((edge) => edge.direction && edge.allowsMatch)
        .map((edge) => edge.direction as DirectionLabel),
    ),
  ].sort();

  const rays: Array<{ direction: DirectionLabel; cellIds: CellId[] }> = [];
  for (const direction of directions) {
    const cellIds = cellsAlongAuthoredDirection(board, pivot, direction);
    if (cellIds.length >= minRayCells) {
      rays.push({ direction, cellIds });
    }
  }
  if (rays.length < 2) {
    return null;
  }
  const kind: AuthoredPatternKind = rays.length >= 4 ? "cross" : rays.length === 3 ? "tee" : "corner";
  return {
    kind,
    pivot,
    cellIds: [...new Set(rays.flatMap((ray) => ray.cellIds))].sort(),
    directions: rays.map((ray) => ray.direction),
  };
}
