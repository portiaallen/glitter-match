import type { CellId } from "../ids.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import type {
  Board,
  BoardDefinition,
  BoardTopology,
  CellDefinition,
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
    direction: string | undefined,
    kind: "adjacent" | "portal" | "bridge",
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
      issues.push(issue("edge.self", path, "A cell cannot be adjacent to itself."));
      return;
    }
    uniquePush(adjacency[from] ?? (adjacency[from] = []), to);
    (directed[from] ?? (directed[from] = [])).push({
      to,
      direction,
      kind,
    });
  };

  for (const [index, edge] of definition.adjacency.entries()) {
    const path = `board.adjacency[${index}]`;
    const kind = edge.kind ?? "adjacent";
    const bidirectional = edge.bidirectional ?? true;
    addDirected(edge.from, edge.to, edge.direction, kind, path);
    if (bidirectional) {
      const reverse = edge.direction ? reverseDirection(edge.direction) : undefined;
      addDirected(edge.to, edge.from, reverse, kind, path);
    }
  }

  const flowDown: Record<CellId, CellId[]> = {};
  const flowUp: Record<CellId, CellId[]> = {};
  for (const id of cellIds) {
    flowDown[id] = [];
    flowUp[id] = [];
  }

  for (const [index, edge] of (definition.flow ?? []).entries()) {
    const path = `board.flow[${index}]`;
    if (!cells[edge.from] || !cells[edge.to]) {
      issues.push(
        issue(
          "flow.unknown_cell",
          path,
          `Flow edge references unknown cell "${edge.from}" -> "${edge.to}".`,
        ),
      );
      continue;
    }
    uniquePush(flowDown[edge.from] ?? (flowDown[edge.from] = []), edge.to);
    uniquePush(flowUp[edge.to] ?? (flowUp[edge.to] = []), edge.from);
  }

  const flowCycle = findCycle(flowDown);
  if (flowCycle) {
    issues.push(
      issue(
        "flow.cycle",
        "board.flow",
        `Flow graph must be a DAG so cascade settling terminates. Cycle: ${flowCycle.join(" -> ")}.`,
      ),
    );
  }

  const portals = definition.portals ?? [];
  for (const [index, portal] of portals.entries()) {
    const path = `board.portals[${index}]`;
    if (!cells[portal.from] || !cells[portal.to]) {
      issues.push(
        issue("portal.unknown_cell", path, `Portal references unknown cell "${portal.from}" / "${portal.to}".`),
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

  throwIfErrors(issues, "Invalid board topology");

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
  return { topology, cells };
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
  const base = board.topology.adjacency[id] ?? [];
  if (!options?.includePortals && !board.topology.portalsConductMatches) {
    return base.filter((other) => {
      const link = board.topology.directed[id]?.find((edge) => edge.to === other);
      return link?.kind !== "portal";
    });
  }
  return [...base];
}

export function areAdjacent(board: Board, a: CellId, b: CellId, options?: { forSwap?: boolean }): boolean {
  const directed = board.topology.directed[a] ?? [];
  return directed.some((edge) => {
    if (edge.to !== b) {
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

function reverseDirection(direction: string): string {
  const table: Record<string, string> = {
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
  };
  return table[direction] ?? `rev:${direction}`;
}

function findCycle(graph: Record<CellId, CellId[]>): CellId[] | null {
  const visiting = new Set<CellId>();
  const visited = new Set<CellId>();
  const stack: CellId[] = [];

  const dfs = (node: CellId): CellId[] | null => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) {
      return null;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of graph[node] ?? []) {
      const cycle = dfs(next);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  for (const node of Object.keys(graph)) {
    const cycle = dfs(node);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}
