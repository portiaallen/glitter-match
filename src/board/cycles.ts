import type { CellId } from "../ids.js";

/** Directed-cycle finder used by flow validation. Returns the cycle path including the repeated start. */
export function findDirectedCycle(graph: Record<string, string[]>): CellId[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string): string[] | null => {
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
