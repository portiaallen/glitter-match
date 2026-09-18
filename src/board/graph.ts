import type { CellId } from "../ids.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import { findDirectedCycle } from "./cycles.js";
import {
  edgeAllowsMatch,
  edgeAllowsSwap,
  resolveTraversal,
  reverseDirection,
} from "./direction.js";
import type {
  Board,
  BoardDefinition,
  BoardTopology,
  CellDefinition,
  DirectedEntry,
  FlowKind,
  MovementRules,
  Occupant,
  RuntimeCell,
} from "./types.js";

function uniquePush(list: CellId[], id: CellId): void {
  if (!list.includes(id)) {
    list.push(id);
  }
}

export function defaultMovementRules(): MovementRules {
  return { mode: "none", refill: { mode: "none" } };
}

export function buildTopology(definition: BoardDefinition): BoardTopology {
  const issues: ValidationIssue[] = [];
  const cells: Record<CellId, CellDefinition> = {};
  const cellIds: CellId[] = [];

  for (const [index, cell] of definition.cells.entries()) {
    const path = `board.cells[${index}]`;
    if (!cell.id) {
      issues.push(issue("cell.empty_id", path, "Cell id is required."));
      continue;
    }
    if (cells[cell.id]) {
      issues.push(issue("cell.duplicate_id", `${path}.id`, `Duplicate cell id "${cell.id}".`));
      continue;
    }
    cells[cell.id] = cell;
    cellIds.push(cell.id);
  }

  const adjacency: Record<CellId, CellId[]> = {};
  const directed: BoardTopology["directed"] = {};
  for (const id of cellIds) {
    adjacency[id] = [];
    directed[id] = [];
  }

  const addDirected = (
    from: CellId,
    to: CellId,
    entry: Omit<DirectedEntry, "to">,
    path: string,
  ): void => {
    if (!cells[from]) {
      issues.push(issue("edge.unknown_from", path, `Unknown from cell "${from}".`));
      return;
    }
    if (!cells[to]) {
      issues.push(issue("edge.unknown_to", path, `Unknown to cell "${to}".`));
      return;
    }
    if (from === to) {
      issues.push(issue("edge.self", path, `A cell cannot be adjacent to itself ("${from}").`));
      return;
    }
    uniquePush(adjacency[from] ?? (adjacency[from] = []), to);
    const list = directed[from] ?? (directed[from] = []);
    if (!list.some((existing) => existing.to === to && existing.kind === entry.kind)) {
      list.push({ ...entry, to });
    }
  };

  for (const [index, edge] of definition.adjacency.entries()) {
    const path = `board.adjacency[${index}]`;
    const kind = edge.kind ?? "adjacent";
    const traversal = resolveTraversal(edge);
    const allowsMatch = edgeAllowsMatch(edge);
    const allowsSwap = edgeAllowsSwap(edge);
    addDirected(
      edge.from,
      edge.to,
      {
        direction: edge.direction,
        orientation: edge.orientation,
        label: edge.label,
        kind,
        allowsMatch,
        allowsSwap,
        authoredForward: true,
      },
      path,
    );
    if (traversal === "both") {
      addDirected(
        edge.to,
        edge.from,
        {
          direction: edge.direction ? reverseDirection(edge.direction) : undefined,
          orientation: edge.orientation,
          label: edge.label,
          kind,
          allowsMatch,
          allowsSwap,
          authoredForward: false,
        },
        path,
      );
    }
  }

  const flowDown: Record<CellId, CellId[]> = {};
  const flowUp: Record<CellId, CellId[]> = {};
  const flowMeta: BoardTopology["flowMeta"] = {};
  for (const id of cellIds) {
    flowDown[id] = [];
    flowUp[id] = [];
  }

  for (const [index, edge] of (definition.flow ?? []).entries()) {
    const path = `board.flow[${index}]`;
    const missing = !cells[edge.from] ? edge.from : !cells[edge.to] ? edge.to : null;
    if (missing) {
      issues.push(
        issue(
          "flow.unknown_cell",
          path,
          `flow edge "${edge.from} → ${edge.to}" references missing cell "${missing}".`,
        ),
      );
      continue;
    }
    if (edge.from === edge.to) {
      issues.push(
        issue("flow.self", path, `flow edge "${edge.from} → ${edge.to}" targets its own cell.`),
      );
      continue;
    }
    uniquePush(flowDown[edge.from] ?? (flowDown[edge.from] = []), edge.to);
    uniquePush(flowUp[edge.to] ?? (flowUp[edge.to] = []), edge.from);
    flowMeta[`${edge.from}→${edge.to}`] = {
      kind: (edge.kind ?? "gravity") as FlowKind,
      label: edge.label,
    };
  }

  const flowCycle = findDirectedCycle(flowDown);
  if (flowCycle) {
    issues.push(
      issue(
        "flow.cycle",
        "board.flow",
        `flow graph contains a cycle: ${flowCycle.join(" → ")}. Cascades would not terminate.`,
      ),
    );
  }

  const portals = definition.portals ?? [];
  for (const [index, portal] of portals.entries()) {
    const path = `board.portals[${index}]`;
    const missing = !cells[portal.from] ? portal.from : !cells[portal.to] ? portal.to : null;
    if (missing) {
      issues.push(
        issue(
          "portal.unknown_cell",
          path,
          `portal "${portal.id}" (${portal.from} → ${portal.to}) references missing cell "${missing}".`,
        ),
      );
    }
  }

  const sections = definition.sections ?? [];
  for (const [index, section] of sections.entries()) {
    const path = `board.sections[${index}]`;
    for (const cellId of section.cellIds) {
      if (!cells[cellId]) {
        issues.push(issue("section.unknown_cell", path, `Section references unknown cell "${cellId}".`));
      }
    }
  }

  throwIfErrors(issues, "BoardValidationError");

  const movement = definition.movement ?? defaultMovementRules();
  const spawnSources =
    movement.refill.sourceCellIds ??
    cellIds.filter((id) => (flowUp[id] ?? []).length === 0 && (flowDown[id] ?? []).length > 0);

  return {
    cellIds,
    cells,
    adjacency,
    directed,
    flowDown,
    flowUp,
    flowMeta,
    portals,
    sections,
    topology: definition.topology,
    movement,
    portalsConductMatches: definition.portalsConductMatches ?? false,
    portalsAllowSwap: definition.portalsAllowSwap ?? false,
    spawnSources,
  };
}

export function createEmptyOccupant(): Occupant {
  return { type: "empty" };
}

export function createRuntimeCell(definition: CellDefinition, occupant: Occupant): RuntimeCell {
  return {
    id: definition.id,
    occupant,
    flags: {
      active: definition.active ?? true,
      hidden: definition.hidden ?? false,
      protected: definition.protected ?? false,
      frozen: definition.frozen ?? false,
    },
    obstacles: (definition.initialObstacles ?? []).map((obstacle) => ({
      type: obstacle.type,
      durability: obstacle.durability ?? 1,
      config: obstacle.config ?? {},
    })),
  };
}

export function createBoard(definition: BoardDefinition, occupants?: Record<CellId, Occupant>): Board {
  const topology = buildTopology(definition);
  const cells: Record<CellId, RuntimeCell> = {};
  for (const id of topology.cellIds) {
    const def = topology.cells[id]!;
    const occupant = occupants?.[id] ?? (def.initialIcon
      ? { type: "icon", iconId: def.initialIcon }
      : createEmptyOccupant());
    cells[id] = createRuntimeCell(def, occupant);
  }
  return { topology, cells, rotation: {} };
}

export function cloneBoard(board: Board): Board {
  return structuredClone(board);
}

export function getCell(board: Board, id: CellId): RuntimeCell {
  const cell = board.cells[id];
  if (!cell) {
    throw new Error(`Unknown cell "${id}".`);
  }
  return cell;
}

export function neighbors(board: Board, id: CellId, options?: { includePortals?: boolean }): CellId[] {
  const directed = board.topology.directed[id] ?? [];
  return directed
    .filter((edge) => {
      if (!edge.allowsMatch) {
        return false;
      }
      if (edge.kind === "portal" && !options?.includePortals && !board.topology.portalsConductMatches) {
        return false;
      }
      return true;
    })
    .map((edge) => edge.to);
}

export function areAdjacent(board: Board, a: CellId, b: CellId, options?: { forSwap?: boolean }): boolean {
  const directed = board.topology.directed[a] ?? [];
  return directed.some((edge) => {
    if (edge.to !== b) {
      return false;
    }
    if (options?.forSwap ? !edge.allowsSwap : !edge.allowsMatch) {
      return false;
    }
    if (edge.kind === "portal") {
      return options?.forSwap ? board.topology.portalsAllowSwap : board.topology.portalsConductMatches;
    }
    return true;
  });
}

export function activeCellIds(board: Board): CellId[] {
  return board.topology.cellIds.filter((id) => getCell(board, id).flags.active);
}

export function setOccupant(board: Board, id: CellId, occupant: Occupant): void {
  getCell(board, id).occupant = occupant;
}
