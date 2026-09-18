import type { CellId } from "../ids.js";
import { graphEdgeKey, type RegionRecord } from "./contract.js";
import { edgeOverlay, type PrimitiveRuntime } from "./runtime.js";

export interface GraphPath {
  cellIds: CellId[];
  edgeKeys: string[];
  blocked: boolean;
}

/**
 * Regions and paths use authored graph connectivity.
 * Visual proximity and x/y are never consulted.
 */
export function discoverRegion(runtime: PrimitiveRuntime, start: CellId): RegionRecord {
  const cellIds: CellId[] = [];
  const seen = new Set<CellId>();
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current) || !runtime.board.topology.cells[current]) {
      continue;
    }
    seen.add(current);
    cellIds.push(current);
    for (const next of walkableNeighbors(runtime, current)) {
      if (!seen.has(next)) {
        stack.push(next);
      }
    }
  }
  return { id: `region:${[...cellIds].sort().join(",")}`, cellIds: cellIds.sort(), state: "open" };
}

export function walkableNeighbors(runtime: PrimitiveRuntime, from: CellId): CellId[] {
  const next: CellId[] = [];
  for (const entry of runtime.board.topology.directed[from] ?? []) {
    const key = graphEdgeKey(from, entry.to);
    const overlay = edgeOverlay(runtime, key);
    const destination = overlay.redirectedTo ?? entry.to;
    if (overlay.active && overlay.traversable) {
      next.push(destination);
    }
  }
  return next;
}

export function findPath(
  runtime: PrimitiveRuntime,
  start: CellId,
  goal: CellId,
  options?: { requireMatch?: boolean; requireSwap?: boolean },
): GraphPath {
  if (!runtime.board.topology.cells[start] || !runtime.board.topology.cells[goal]) {
    return { cellIds: [], edgeKeys: [], blocked: true };
  }
  const queue: CellId[][] = [[start]];
  const seen = new Set<CellId>([start]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1]!;
    if (current === goal) {
      return {
        cellIds: path,
        edgeKeys: path.slice(1).map((to, index) => graphEdgeKey(path[index]!, to)),
        blocked: false,
      };
    }
    for (const entry of runtime.board.topology.directed[current] ?? []) {
      const key = graphEdgeKey(current, entry.to);
      const overlay = edgeOverlay(runtime, key);
      const destination = overlay.redirectedTo ?? entry.to;
      if (!overlay.active || !overlay.traversable) {
        continue;
      }
      if (options?.requireMatch && !overlay.allowsMatch) {
        continue;
      }
      if (options?.requireSwap && !overlay.allowsSwap) {
        continue;
      }
      if (seen.has(destination)) {
        continue;
      }
      seen.add(destination);
      queue.push([...path, destination]);
    }
  }
  return { cellIds: [start], edgeKeys: [], blocked: true };
}

export function validatePath(runtime: PrimitiveRuntime, cellIds: CellId[]): boolean {
  if (cellIds.length < 2) {
    return cellIds.length === 1 && Boolean(runtime.board.topology.cells[cellIds[0]!]);
  }
  for (let index = 0; index < cellIds.length - 1; index += 1) {
    const from = cellIds[index]!;
    const to = cellIds[index + 1]!;
    if (!walkableNeighbors(runtime, from).includes(to)) {
      return false;
    }
  }
  return true;
}
