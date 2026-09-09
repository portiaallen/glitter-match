import { boardDefinitionSchema } from "./schema.js";
import type { BoardDefinition, Occupant } from "./types.js";
import type { Board } from "./types.js";
import { getCell } from "./graph.js";

export interface SerializedBoardState {
  definition: BoardDefinition;
  occupants: Record<string, string | null>;
  rotation?: Board["rotation"];
}

function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function sortEdges<T extends { from: string; to: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}

/** Canonical, stable JSON for authoring round-trips. */
export function canonicalizeBoardDefinition(definition: BoardDefinition): BoardDefinition {
  return sortKeys({
    topology: { ...definition.topology },
    cells: sortById(definition.cells).map((cell) => ({ ...cell, position: { ...cell.position } })),
    adjacency: sortEdges(definition.adjacency).map((edge) => ({ ...edge })),
    flow: definition.flow ? sortEdges(definition.flow).map((edge) => ({ ...edge })) : undefined,
    portals: definition.portals
      ? sortById(definition.portals).map((portal) => ({ ...portal }))
      : undefined,
    sections: definition.sections
      ? sortById(definition.sections).map((section) => ({
          ...section,
          cellIds: [...section.cellIds].sort(),
        }))
      : undefined,
    movement: definition.movement ? structuredClone(definition.movement) : undefined,
    portalsConductMatches: definition.portalsConductMatches,
    portalsAllowSwap: definition.portalsAllowSwap,
  }) as BoardDefinition;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  return value;
}

export function serializeBoardDefinition(definition: BoardDefinition): string {
  return `${JSON.stringify(canonicalizeBoardDefinition(definition), null, 2)}\n`;
}

export function deserializeBoardDefinition(input: string | unknown): BoardDefinition {
  const raw = typeof input === "string" ? JSON.parse(input) : input;
  return canonicalizeBoardDefinition(boardDefinitionSchema.parse(raw));
}

export function boardDefinitionsEquivalent(a: BoardDefinition, b: BoardDefinition): boolean {
  return serializeBoardDefinition(a) === serializeBoardDefinition(b);
}

export function serializeBoardState(definition: BoardDefinition, board: Board): SerializedBoardState {
  const occupants: Record<string, string | null> = {};
  for (const id of board.topology.cellIds) {
    const occupant = getCell(board, id).occupant;
    occupants[id] = occupant.type === "icon" ? occupant.iconId : null;
  }
  return {
    definition: canonicalizeBoardDefinition(definition),
    occupants,
    rotation: structuredClone(board.rotation),
  };
}

export function occupantsFromSerialized(state: SerializedBoardState): Record<string, Occupant> {
  const occupants: Record<string, Occupant> = {};
  for (const [id, iconId] of Object.entries(state.occupants)) {
    occupants[id] = iconId ? { type: "icon", iconId } : { type: "empty" };
  }
  return occupants;
}
