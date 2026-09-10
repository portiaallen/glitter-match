import { cloneBoard, getCell, type Board } from "../board/index.js";
import type { CellId } from "../ids.js";
import type {
  CellOverlay,
  CellPrimitiveState,
  EdgeOverlay,
  OccupantMark,
  PrimitiveEvent,
  RegionRecord,
  RelationshipRecord,
  SyncRecord,
  TemporaryRecord,
  ThresholdRecord,
} from "./contract.js";

export interface PrimitiveCounters {
  moves: number;
  cascades: number;
  objective: Record<string, number>;
}

export interface PrimitiveRuntime {
  board: Board;
  cells: Record<string, CellOverlay>;
  edges: Record<string, EdgeOverlay>;
  occupants: Record<string, OccupantMark>;
  relationships: Record<string, RelationshipRecord>;
  temporary: Record<string, TemporaryRecord>;
  thresholds: Record<string, ThresholdRecord>;
  syncGroups: Record<string, SyncRecord>;
  regions: Record<string, RegionRecord>;
  counters: PrimitiveCounters;
  mechanicPayload: Record<string, unknown>;
  events: PrimitiveEvent[];
  transitionState: string;
}

export function createPrimitiveRuntime(board: Board): PrimitiveRuntime {
  return {
    board,
    cells: {},
    edges: {},
    occupants: {},
    relationships: {},
    temporary: {},
    thresholds: {},
    syncGroups: {},
    regions: {},
    counters: { moves: 0, cascades: 0, objective: {} },
    mechanicPayload: {},
    events: [],
    transitionState: "idle",
  };
}

export function clonePrimitiveRuntime(runtime: PrimitiveRuntime): PrimitiveRuntime {
  return {
    board: cloneBoard(runtime.board),
    cells: structuredClone(runtime.cells),
    edges: structuredClone(runtime.edges),
    occupants: structuredClone(runtime.occupants),
    relationships: structuredClone(runtime.relationships),
    temporary: structuredClone(runtime.temporary),
    thresholds: structuredClone(runtime.thresholds),
    syncGroups: structuredClone(runtime.syncGroups),
    regions: structuredClone(runtime.regions),
    counters: structuredClone(runtime.counters),
    mechanicPayload: structuredClone(runtime.mechanicPayload),
    events: structuredClone(runtime.events),
    transitionState: runtime.transitionState,
  };
}

export function replaceRuntime(target: PrimitiveRuntime, source: PrimitiveRuntime): void {
  target.board = source.board;
  target.cells = source.cells;
  target.edges = source.edges;
  target.occupants = source.occupants;
  target.relationships = source.relationships;
  target.temporary = source.temporary;
  target.thresholds = source.thresholds;
  target.syncGroups = source.syncGroups;
  target.regions = source.regions;
  target.counters = source.counters;
  target.mechanicPayload = source.mechanicPayload;
  target.events = source.events;
  target.transitionState = source.transitionState;
}

export function serializePrimitiveRuntime(runtime: PrimitiveRuntime): Record<string, unknown> {
  const occupants: Record<string, string | null> = {};
  for (const id of runtime.board.topology.cellIds) {
    const occupant = getCell(runtime.board, id).occupant;
    occupants[id] = occupant.type === "icon" ? occupant.iconId : null;
  }
  const flags: Record<string, PrimitiveRuntime["board"]["cells"][string]["flags"]> = {};
  for (const id of runtime.board.topology.cellIds) {
    flags[id] = { ...getCell(runtime.board, id).flags };
  }
  return {
    occupants,
    flags,
    cells: runtime.cells,
    edges: runtime.edges,
    occupantMarks: runtime.occupants,
    relationships: runtime.relationships,
    temporary: runtime.temporary,
    thresholds: runtime.thresholds,
    syncGroups: runtime.syncGroups,
    regions: runtime.regions,
    counters: runtime.counters,
    mechanicPayload: runtime.mechanicPayload,
    transitionState: runtime.transitionState,
  };
}

export function comparePrimitiveRuntime(a: PrimitiveRuntime, b: PrimitiveRuntime): boolean {
  return stableStringify(serializePrimitiveRuntime(a)) === stableStringify(serializePrimitiveRuntime(b));
}

export function cellOverlay(runtime: PrimitiveRuntime, cellId: CellId): CellOverlay {
  return runtime.cells[cellId] ?? { named: ["normal"], custom: [] };
}

export function hasCellState(runtime: PrimitiveRuntime, cellId: CellId, state: CellPrimitiveState): boolean {
  const overlay = cellOverlay(runtime, cellId);
  if (overlay.named.includes(state)) {
    return true;
  }
  const flags = getCell(runtime.board, cellId).flags;
  if (state === "active") {
    return flags.active;
  }
  if (state === "inactive") {
    return !flags.active;
  }
  if (state === "hidden") {
    return flags.hidden;
  }
  if (state === "revealed") {
    return !flags.hidden;
  }
  if (state === "protected") {
    return flags.protected;
  }
  if (state === "vulnerable") {
    return !flags.protected;
  }
  if (state === "frozen") {
    return flags.frozen;
  }
  return false;
}

export function defaultEdgeOverlay(): EdgeOverlay {
  return { active: true, traversable: true, allowsMatch: true, allowsSwap: true };
}

export function edgeOverlay(runtime: PrimitiveRuntime, edgeKey: string): EdgeOverlay {
  return runtime.edges[edgeKey] ?? readAuthoredEdge(runtime, edgeKey) ?? defaultEdgeOverlay();
}

export function readAuthoredEdge(runtime: PrimitiveRuntime, edgeKey: string): EdgeOverlay | null {
  const split = edgeKey.split("->");
  if (split.length !== 2) {
    return null;
  }
  const [from, to] = split;
  const entry = (runtime.board.topology.directed[from!] ?? []).find((edge) => edge.to === to);
  if (!entry) {
    return null;
  }
  return {
    active: true,
    traversable: true,
    allowsMatch: entry.allowsMatch,
    allowsSwap: entry.allowsSwap,
  };
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
