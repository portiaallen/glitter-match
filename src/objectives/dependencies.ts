import { issue, type ValidationIssue } from "../validation.js";
import type { ObjectiveDefinition } from "./model.js";

export function collectObjectiveTree(root: ObjectiveDefinition): ObjectiveDefinition[] {
  const all: ObjectiveDefinition[] = [];
  const walk = (node: ObjectiveDefinition) => {
    all.push(node);
    for (const child of node.children ?? []) {
      walk(child);
    }
    for (const stage of node.stages ?? []) {
      walk(stage);
    }
  };
  walk(root);
  return all;
}

export function validateObjectiveDependencies(roots: ObjectiveDefinition[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = roots.flatMap(collectObjectiveTree);
  const ids = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const dependency of node.dependsOn ?? []) {
      if (!ids.has(dependency)) {
        issues.push(issue("objective.missing_dependency", `objectives.${node.id}.dependsOn`, `Dependency "${dependency}" does not exist.`));
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (visited.has(id)) {
      return;
    }
    if (visiting.has(id)) {
      issues.push(issue("objective.dependency_cycle", `objectives.${id}.dependsOn`, `Circular objective dependency: ${[...path, id].join(" → ")}.`));
      return;
    }
    visiting.add(id);
    for (const dependency of ids.get(id)?.dependsOn ?? []) {
      visit(dependency, [...path, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of nodes) {
    visit(node.id, []);
  }
  return issues;
}

export function dependenciesSatisfied(
  definition: ObjectiveDefinition,
  statusById: Record<string, string>,
): boolean {
  return (definition.dependsOn ?? []).every((id) => statusById[id] === "COMPLETE");
}
