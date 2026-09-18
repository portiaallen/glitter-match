import { issue, type ValidationIssue } from "../validation.js";
import type { ObjectiveDefinition } from "./model.js";
import { OBJECTIVE_TYPES } from "./model.js";
import { collectObjectiveTree, validateObjectiveDependencies } from "./dependencies.js";
import { getDefaultObjectiveRegistry, type ObjectiveRegistry } from "./registry.js";
import {
  COMPLETION_POLICIES,
  COMPOSITION_OPS,
  CONFLICT_POLICIES,
  COUNT_UNITS,
  FAILURE_POLICIES,
  OBJECTIVE_ROLES,
  type WinStateConfig,
} from "./types.js";

export function validateObjectiveDefinition(
  definition: ObjectiveDefinition,
  registry: ObjectiveRegistry = getDefaultObjectiveRegistry(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `objectives.${definition.id}`;
  if (!definition.id) {
    issues.push(issue("objective.invalid_id", `${path}.id`, "Objective id is required."));
  }
  if (!(OBJECTIVE_TYPES as readonly string[]).includes(definition.type)) {
    issues.push(issue("objective.unknown_type", `${path}.type`, `Unknown objective type "${definition.type}".`));
  } else if (!registry.has(definition.type)) {
    issues.push(issue("objective.unregistered", path, `Objective type "${definition.type}" is not registered.`));
  }
  if (definition.version) {
    const major = Number(definition.version.split(".")[0]);
    if (!Number.isFinite(major) || major < 8) {
      issues.push(issue("objective.incompatible_version", `${path}.version`, `Objective version "${definition.version}" is not compatible.`));
    }
  }
  if (definition.role && !(OBJECTIVE_ROLES as readonly string[]).includes(definition.role)) {
    issues.push(issue("objective.invalid_role", `${path}.role`, `Unknown role "${definition.role}".`));
  }
  if (definition.countUnit && !(COUNT_UNITS as readonly string[]).includes(definition.countUnit)) {
    issues.push(issue("objective.invalid_count_unit", `${path}.countUnit`, `Unknown count unit "${definition.countUnit}".`));
  }
  if (definition.composition && !(COMPOSITION_OPS as readonly string[]).includes(definition.composition)) {
    issues.push(issue("objective.invalid_composition", `${path}.composition`, `Unknown composition "${definition.composition}".`));
  }
  if (definition.type === "hybrid") {
    const children = definition.children ?? [];
    const op = definition.composition ?? (definition.mode === "any" ? "or" : "and");
    if (op === "not" && children.length !== 1) {
      issues.push(issue("objective.malformed_composition", path, "NOT composition requires exactly one child."));
    }
    if ((op === "and" || op === "or" || op === "sequence") && children.length < 2) {
      issues.push(issue("objective.malformed_composition", path, `${op.toUpperCase()} composition requires at least two children.`));
    }
    if (op === "not" && children[0]?.id === definition.id) {
      issues.push(issue("objective.impossible_composition", path, "An objective cannot NOT itself."));
    }
  }
  if (definition.type === "multi-stage" && (!definition.stages || definition.stages.length === 0)) {
    issues.push(issue("objective.invalid_stage", `${path}.stages`, "Multi-stage objectives require at least one stage."));
  }
  if (definition.type === "pattern" && definition.patternId) {
    try {
      registry.get("pattern");
    } catch {
      issues.push(issue("objective.invalid_pattern", `${path}.patternId`, "Pattern handler is missing."));
    }
  }
  if (!definition.accessibilityLabel && !definition.id) {
    issues.push(issue("objective.a11y", `${path}.accessibility`, "Objectives must be describable without color."));
  }
  for (const child of [...(definition.children ?? []), ...(definition.stages ?? [])]) {
    issues.push(...validateObjectiveDefinition(child, registry));
  }
  return issues;
}

export function validateObjectiveForest(roots: ObjectiveDefinition[], win?: Partial<WinStateConfig>): ValidationIssue[] {
  const issues = roots.flatMap((root) => validateObjectiveDefinition(root));
  issues.push(...validateObjectiveDependencies(roots));
  if (win?.completionPolicy && !(COMPLETION_POLICIES as readonly string[]).includes(win.completionPolicy)) {
    issues.push(issue("objective.invalid_completion_policy", "winState.completionPolicy", `Unknown completion policy "${win.completionPolicy}".`));
  }
  if (win?.failurePolicy && !(FAILURE_POLICIES as readonly string[]).includes(win.failurePolicy)) {
    issues.push(issue("objective.invalid_failure_policy", "winState.failurePolicy", `Unknown failure policy "${win.failurePolicy}".`));
  }
  if (win?.conflictPolicy && !(CONFLICT_POLICIES as readonly string[]).includes(win.conflictPolicy)) {
    issues.push(issue("objective.invalid_conflict_policy", "winState.conflictPolicy", `Unknown conflict policy "${win.conflictPolicy}".`));
  }
  const ids = roots.flatMap(collectObjectiveTree).map((node) => node.id);
  if (new Set(ids).size !== ids.length) {
    issues.push(issue("objective.duplicate_id", "objectives", "Objective ids must be unique in a forest."));
  }
  return issues;
}
