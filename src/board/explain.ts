import type { CellId } from "../ids.js";
import type { Board } from "./types.js";
import { areAdjacent, getCell } from "./graph.js";
import type { ObstacleRegistry } from "../obstacles/index.js";
import { canAttemptSwap } from "../fairness/index.js";

export interface InteractionExplanation {
  a: CellId;
  b: CellId;
  canSwap: boolean;
  shareEdge: boolean;
  edgeKind: string | null;
  portal: boolean;
  visuallyClose: boolean;
  coordinateGridAdjacent: boolean;
  reasons: string[];
}

/**
 * Answers "why can these two cells interact?" using the graph, not x±1/y±1.
 */
export function explainInteraction(
  board: Board,
  a: CellId,
  b: CellId,
  obstacles: ObstacleRegistry,
): InteractionExplanation {
  const reasons: string[] = [];
  if (a === b) {
    return {
      a,
      b,
      canSwap: false,
      shareEdge: false,
      edgeKind: null,
      portal: false,
      visuallyClose: false,
      coordinateGridAdjacent: false,
      reasons: ["A cell cannot interact with itself."],
    };
  }

  const posA = board.topology.cells[a]?.position;
  const posB = board.topology.cells[b]?.position;
  const dx = posA && posB ? Math.abs(posA.x - posB.x) : Number.POSITIVE_INFINITY;
  const dy = posA && posB ? Math.abs(posA.y - posB.y) : Number.POSITIVE_INFINITY;
  const dist = Math.hypot(dx === Number.POSITIVE_INFINITY ? 99 : dx, dy === Number.POSITIVE_INFINITY ? 99 : dy);
  const visuallyClose = dist > 0 && dist <= 2.4;
  const coordinateGridAdjacent = Number.isInteger(dx) && Number.isInteger(dy) && dx + dy === 1;

  const directed = board.topology.directed[a]?.find((edge) => edge.to === b);
  const shareEdge = Boolean(directed);
  const edgeKind = directed?.kind ?? null;
  const portal = edgeKind === "portal";
  const swapAdjacent = areAdjacent(board, a, b, { forSwap: true });
  const canSwap = canAttemptSwap(board, a, b, obstacles);

  if (shareEdge) {
    reasons.push(
      `The board definition connects "${a}" to "${b}" with a ${edgeKind ?? "adjacent"} edge` +
        (directed?.direction ? ` (direction "${directed.direction}")` : "") +
        ".",
    );
  } else {
    reasons.push(`There is no authored edge between "${a}" and "${b}". The graph is authoritative.`);
  }

  if (portal) {
    reasons.push(
      board.topology.portalsAllowSwap
        ? "This portal relationship allows swaps."
        : "This is a portal edge; swaps are disabled unless portalsAllowSwap is true.",
    );
  }

  if (visuallyClose && !shareEdge) {
    reasons.push(
      `They look close in space (distance ${dist.toFixed(2)}) but visual proximity is not adjacency.`,
    );
  }

  if (coordinateGridAdjacent && !shareEdge) {
    reasons.push("They would be neighbors on a rectangular grid (x±1/y±1), but this engine does not use grid adjacency.");
  }

  if (shareEdge && !coordinateGridAdjacent) {
    reasons.push("They interact even though they are not 4-adjacent in coordinate space.");
  }

  const cellA = getCell(board, a);
  const cellB = getCell(board, b);
  if (!cellA.flags.active || !cellB.flags.active) {
    reasons.push("At least one cell is inactive.");
  }
  if (cellA.occupant.type !== "icon" || cellB.occupant.type !== "icon") {
    reasons.push("Both cells need icons to swap.");
  }

  if (!canSwap && swapAdjacent) {
    reasons.push("The topology connects them, but a lock/ice/frozen flag currently blocks the swap.");
  }

  return {
    a,
    b,
    canSwap,
    shareEdge,
    edgeKind,
    portal,
    visuallyClose,
    coordinateGridAdjacent,
    reasons,
  };
}
