import type { CellId, SectionId } from "../ids.js";
import { applyDirectionMap, DEFAULT_QUARTER_TURN_DIRECTION_MAP } from "./direction.js";
import { getCell } from "./graph.js";
import type { Board, Occupant, ObstacleInstance, SectionRotationState } from "./types.js";

export interface OccupantPayload {
  occupant: Occupant;
  frozen: boolean;
  hidden: boolean;
  protected: boolean;
  obstacles: ObstacleInstance[];
}

export interface RotationStepResult {
  sectionId: SectionId;
  steps: number;
  visualAngle: number;
  occupantMoves: Array<{ from: CellId; to: CellId }>;
}

/**
 * Rotate a section as a graph transformation.
 *
 * Boundary (intentionally not inferred):
 * - Occupants move along authored `occupantCycles`. The engine does not
 *   invent a cycle from a bounding box, bitmap, or screen-space angle.
 * - Cell ids (sockets), terrain, portals, and adjacency stay put.
 * - Direction labels remap only when `remapDirections` is authored.
 * - `visualAngle` is presentation state. Matching never reads it.
 */
export function rotateSection(board: Board, sectionId: SectionId, steps = 1): RotationStepResult {
  const section = board.topology.sections.find((item) => item.id === sectionId);
  if (!section) {
    throw new Error(`Unknown section "${sectionId}".`);
  }
  const spec = section.rotation;
  if (!spec?.rotatable) {
    throw new Error(`Section "${sectionId}" is not rotatable.`);
  }

  const current = board.rotation[sectionId] ?? { steps: 0, visualAngle: 0 };
  const next: SectionRotationState = {
    steps: current.steps + steps,
    visualAngle: current.visualAngle + steps * spec.incrementDegrees,
  };
  board.rotation[sectionId] = next;

  const occupantMoves: Array<{ from: CellId; to: CellId }> = [];
  for (const cycle of spec.occupantCycles ?? []) {
    occupantMoves.push(...rotateOccupantCycle(board, cycle, steps));
    if (spec.cyclePresentationPositions) {
      rotatePresentationPositions(board, cycle, steps);
    }
  }

  if (spec.remapDirections) {
    const map = spec.directionMap ?? DEFAULT_QUARTER_TURN_DIRECTION_MAP;
    remapIntraSectionDirections(board, new Set(section.cellIds), map, steps);
  }

  return {
    sectionId,
    steps: next.steps,
    visualAngle: next.visualAngle,
    occupantMoves,
  };
}

export function serializeRotationState(board: Board): Record<SectionId, SectionRotationState> {
  return structuredClone(board.rotation);
}

export function applyRotationState(
  board: Board,
  target: Record<SectionId, SectionRotationState>,
): void {
  const ids = new Set([...Object.keys(board.rotation), ...Object.keys(target)]);
  for (const sectionId of ids) {
    const current = board.rotation[sectionId]?.steps ?? 0;
    const wanted = target[sectionId]?.steps ?? 0;
    const delta = wanted - current;
    if (delta !== 0) {
      rotateSection(board, sectionId, delta);
    }
  }
}

function rotateOccupantCycle(board: Board, cycle: CellId[], steps: number): Array<{ from: CellId; to: CellId }> {
  const n = cycle.length;
  if (n < 2) {
    return [];
  }
  const k = ((steps % n) + n) % n;
  if (k === 0) {
    return [];
  }
  const payloads = cycle.map((id) => snapshotPayload(board, id));
  const moves: Array<{ from: CellId; to: CellId }> = [];
  for (let i = 0; i < n; i += 1) {
    const dest = cycle[(i + k) % n]!;
    restorePayload(board, dest, payloads[i]!);
    moves.push({ from: cycle[i]!, to: dest });
  }
  return moves;
}

function rotatePresentationPositions(board: Board, cycle: CellId[], steps: number): void {
  const n = cycle.length;
  const k = ((steps % n) + n) % n;
  if (k === 0) {
    return;
  }
  const positions = cycle.map((id) => ({ ...board.topology.cells[id]!.position }));
  for (let i = 0; i < n; i += 1) {
    const dest = cycle[(i + k) % n]!;
    board.topology.cells[dest]!.position = positions[i]!;
  }
}

function remapIntraSectionDirections(
  board: Board,
  sectionCells: Set<CellId>,
  map: Record<string, string>,
  steps: number,
): void {
  for (const from of sectionCells) {
    const edges = board.topology.directed[from] ?? [];
    for (const edge of edges) {
      if (!sectionCells.has(edge.to) || !edge.direction) {
        continue;
      }
      edge.direction = applyDirectionMap(edge.direction, map, steps);
    }
  }
}

function snapshotPayload(board: Board, id: CellId): OccupantPayload {
  const cell = getCell(board, id);
  return {
    occupant: structuredClone(cell.occupant),
    frozen: cell.flags.frozen,
    hidden: cell.flags.hidden,
    protected: cell.flags.protected,
    obstacles: structuredClone(cell.obstacles),
  };
}

function restorePayload(board: Board, id: CellId, payload: OccupantPayload): void {
  const cell = getCell(board, id);
  cell.occupant = structuredClone(payload.occupant);
  cell.flags.frozen = payload.frozen;
  cell.flags.hidden = payload.hidden;
  cell.flags.protected = payload.protected;
  cell.obstacles = structuredClone(payload.obstacles);
}
