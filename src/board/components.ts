import type { CellId } from "../ids.js";
import { issue, type ValidationIssue } from "../validation.js";
import type { BoardDefinition, EdgeDefinition } from "./types.js";

export interface ConnectedComponent {
  cellIds: CellId[];
}

export function adjacencyMap(definition: BoardDefinition): Map<CellId, Set<CellId>> {
  const ids = new Set(definition.cells.map((cell) => cell.id));
  const adjacency = new Map<CellId, Set<CellId>>();
  for (const id of ids) {
    adjacency.set(id, new Set());
  }

  const add = (from: CellId, to: CellId) => {
    adjacency.get(from)?.add(to);
  };

  for (const edge of definition.adjacency) {
    add(edge.from, edge.to);
    add(edge.to, edge.from);
  }

  for (const portal of definition.portals ?? []) {
    add(portal.from, portal.to);
    if (portal.bidirectional ?? true) {
      add(portal.to, portal.from);
    }
  }

  return adjacency;
}

export function connectedComponents(definition: BoardDefinition): ConnectedComponent[] {
  const ids = definition.cells.map((cell) => cell.id);
  const adjacency = adjacencyMap(definition);
  const seen = new Set<CellId>();
  const components: ConnectedComponent[] = [];

  for (const start of ids) {
    if (seen.has(start)) {
      continue;
    }
    const stack = [start];
    const cellIds: CellId[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (seen.has(current)) {
        continue;
      }
      seen.add(current);
      cellIds.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          stack.push(next);
        }
      }
    }
    components.push({ cellIds: cellIds.sort() });
  }
  return components;
}

export function connectivityRequired(definition: BoardDefinition): boolean {
  if (definition.topology.connectivity === "optional") {
    return false;
  }
  if (definition.topology.connectivity === "required") {
    return true;
  }
  const kind = definition.topology.kind;
  return kind !== "portal-connected" && kind !== "multi-chamber" && kind !== "twin-path";
}

export function findCycleUndirected(adjacency: Map<CellId, Set<CellId>>): CellId[] | null {
  const seen = new Set<CellId>();
  const parent = new Map<CellId, CellId | null>();

  for (const start of adjacency.keys()) {
    if (seen.has(start)) {
      continue;
    }
    const stack: CellId[] = [start];
    parent.set(start, null);
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (seen.has(node)) {
        continue;
      }
      seen.add(node);
      for (const next of adjacency.get(node) ?? []) {
        if (next === parent.get(node)) {
          continue;
        }
        if (seen.has(next)) {
          return [node, next];
        }
        parent.set(next, node);
        stack.push(next);
      }
    }
  }
  return null;
}

export function edgeKey(edge: Pick<EdgeDefinition, "from" | "to" | "kind">): string {
  const [a, b] = [edge.from, edge.to].sort();
  return `${edge.kind ?? "adjacent"}:${a}::${b}`;
}
