import type { Board } from "../board/index.js";
import { getCell } from "../board/index.js";
import type { CellId } from "../ids.js";
import type { PrimitiveEffect } from "../primitives/index.js";
import { matchNeighbors } from "../matching/occupancy.js";
import { cueForSpecial, type SpecialMatchInstance, type SpecialMatchTrigger } from "./types.js";

function clearCellEffect(cellId: CellId, typeId: string): PrimitiveEffect {
  return {
    kind: "change-occupant",
    cellIds: [cellId],
    occupant: { type: "empty" },
    cue: cueForSpecial(typeId, `Clear occupant at ${cellId}`),
    payload: { source: "special-match", typeId },
  };
}

function walkDirection(board: Board, start: CellId, direction: string, maxSteps = 12): CellId[] {
  const cells: CellId[] = [];
  const visited = new Set<CellId>([start]);
  let current = start;
  for (let step = 0; step < maxSteps; step += 1) {
    const next = (board.topology.directed[current] ?? []).find(
      (edge) => edge.direction === direction && edge.allowsMatch && !visited.has(edge.to),
    );
    if (!next) {
      break;
    }
    cells.push(next.to);
    visited.add(next.to);
    current = next.to;
  }
  return cells;
}

export function lineClearEffects(board: Board, instance: SpecialMatchInstance): PrimitiveEffect[] {
  const directions = instance.metadata.directionsUsed.length
    ? instance.metadata.directionsUsed
    : [...new Set((board.topology.directed[instance.anchorCellId] ?? []).map((edge) => edge.direction).filter(Boolean) as string[])];
  const targets = new Set<CellId>();
  for (const direction of [...directions].sort()) {
    for (const cellId of walkDirection(board, instance.anchorCellId, direction)) {
      targets.add(cellId);
    }
  }
  return [...targets].sort().map((cellId) => clearCellEffect(cellId, instance.typeId));
}

export function areaClearEffects(board: Board, instance: SpecialMatchInstance): PrimitiveEffect[] {
  const targets = matchNeighbors(board, instance.anchorCellId).map((edge) => edge.to);
  return [...new Set(targets)].sort().map((cellId) => clearCellEffect(cellId, instance.typeId));
}

export function crossClearEffects(board: Board, instance: SpecialMatchInstance): PrimitiveEffect[] {
  const directions = [
    ...new Set(
      (board.topology.directed[instance.anchorCellId] ?? [])
        .map((edge) => edge.direction)
        .filter((direction): direction is string => Boolean(direction)),
    ),
  ].sort();
  const targets = new Set<CellId>();
  for (const direction of directions) {
    for (const cellId of walkDirection(board, instance.anchorCellId, direction)) {
      targets.add(cellId);
    }
  }
  return [...targets].sort().map((cellId) => clearCellEffect(cellId, instance.typeId));
}

export function placeSpecialOccupantEffect(instance: SpecialMatchInstance): PrimitiveEffect {
  return {
    kind: "change-occupant",
    cellIds: [instance.anchorCellId],
    occupant: { type: "special-match", typeId: instance.typeId, instanceId: instance.instanceId },
    cue: cueForSpecial(instance.typeId, `Place ${instance.typeId} Special Match at ${instance.anchorCellId}`),
    payload: { source: "special-match-create", typeId: instance.typeId },
  };
}

export function consumeSpecialOccupantEffect(instance: SpecialMatchInstance): PrimitiveEffect {
  return {
    kind: "change-occupant",
    cellIds: [instance.anchorCellId],
    occupant: { type: "empty" },
    cue: cueForSpecial(instance.typeId, `Consume Special Match at ${instance.anchorCellId}`),
    payload: { source: "special-match-consume", typeId: instance.typeId },
  };
}

export function cellHasSpecial(board: Board, cellId: CellId): { typeId: string; instanceId: string } | undefined {
  const occupant = board.cells[cellId]?.occupant;
  if (occupant?.type === "special-match") {
    return { typeId: occupant.typeId, instanceId: occupant.instanceId };
  }
  return undefined;
}
