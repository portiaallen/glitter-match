import { issue, type ValidationIssue } from "../validation.js";
import { validateUnlockCondition } from "./unlock.js";
import type { ProgressionEdge, ProgressionNode, UniverseContent } from "./types.js";

export function nodesById(universe: UniverseContent, catalog: readonly ProgressionNode[]): Map<string, ProgressionNode> {
  return new Map(catalog.map((node) => [node.id, node]));
}

export function collectEdges(universe: UniverseContent): ProgressionEdge[] {
  return universe.packs.flatMap((pack) => pack.edges);
}

export function validatePrerequisiteGraph(universe: UniverseContent, catalog: readonly ProgressionNode[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set(catalog.map((node) => node.id));
  const edgeKeys = new Set<string>();
  for (const pack of universe.packs) {
    for (const id of pack.nodeIds) {
      if (!ids.has(id)) {
        issues.push(issue("progression.missing_node", `packs.${pack.id}`, `Pack references missing node "${id}".`));
      }
    }
    for (const [index, edge] of pack.edges.entries()) {
      const key = `${edge.from}->${edge.to}`;
      if (edgeKeys.has(key)) {
        issues.push(issue("progression.duplicate_edge", `packs.${pack.id}.edges[${index}]`, `Duplicate progression edge ${key}.`));
      }
      edgeKeys.add(key);
      if (!ids.has(edge.from)) {
        issues.push(issue("progression.missing_node", `packs.${pack.id}.edges[${index}].from`, `Edge source "${edge.from}" does not exist.`));
      }
      if (!ids.has(edge.to)) {
        issues.push(issue("progression.missing_node", `packs.${pack.id}.edges[${index}].to`, `Edge destination "${edge.to}" does not exist.`));
      }
      if (edge.condition) {
        issues.push(...validateUnlockCondition(edge.condition, ids, `packs.${pack.id}.edges[${index}].condition`));
      }
    }
  }
  for (const node of catalog) {
    issues.push(...validateUnlockCondition(node.unlock, ids, `nodes.${node.id}.unlock`));
  }
  issues.push(...detectCycles(catalog));
  return issues;
}

function detectCycles(catalog: readonly ProgressionNode[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const deps = new Map<string, string[]>();
  for (const node of catalog) {
    deps.set(node.id, referencedLevelIds(node.unlock));
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      issues.push(
        issue("progression.dependency_cycle", `nodes.${id}.unlock`, `Circular prerequisite: ${[...path, id].join(" → ")}.`),
      );
      return;
    }
    visiting.add(id);
    for (const next of deps.get(id) ?? []) {
      visit(next, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of catalog) {
    visit(node.id, []);
  }
  return issues;
}

export function referencedLevelIds(condition: ProgressionNode["unlock"]): string[] {
  const ids: string[] = [];
  const walk = (node: ProgressionNode["unlock"]) => {
    if (node.levelId) {
      ids.push(node.levelId);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(condition);
  return ids;
}
