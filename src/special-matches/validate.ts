import type { Board } from "../board/index.js";
import { issue, type ValidationIssue } from "../validation.js";
import { DEFAULT_CASCADE_LIMITS, SPECIAL_MATCH_LIFECYCLE, type CascadeSafetyLimits } from "./types.js";
import type { SpecialMatchRegistry } from "./registry.js";
import type { SpecialMatchRuntime } from "./runtime.js";

export function validateSpecialMatchState(
  board: Board,
  runtime: SpecialMatchRuntime,
  registry: SpecialMatchRegistry,
  limits: CascadeSafetyLimits = DEFAULT_CASCADE_LIMITS,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const instance of Object.values(runtime.instances)) {
    const path = `specialMatches.${instance.instanceId}`;
    if (seen.has(instance.instanceId)) {
      issues.push(issue("special.duplicate_instance", path, `Duplicate Special Match instance "${instance.instanceId}".`));
    }
    seen.add(instance.instanceId);
    if (!registry.has(instance.typeId)) {
      issues.push(issue("special.unknown_type", `${path}.typeId`, `Unknown Special Match type "${instance.typeId}".`));
    } else {
      const type = registry.get(instance.typeId);
      if (instance.typeVersion && instance.typeVersion !== type.version && instance.typeVersion.split(".")[0] !== type.version.split(".")[0]) {
        issues.push(issue("special.incompatible_version", `${path}.typeVersion`, `Type version "${instance.typeVersion}" is not compatible with "${type.version}".`));
      }
    }
    if (!board.topology.cells[instance.anchorCellId]) {
      issues.push(issue("special.unknown_anchor", `${path}.anchorCellId`, `Anchor "${instance.anchorCellId}" is not a board cell.`));
    }
    if (!(SPECIAL_MATCH_LIFECYCLE as readonly string[]).includes(instance.state)) {
      issues.push(issue("special.invalid_state", `${path}.state`, `Invalid lifecycle "${instance.state}".`));
    }
    const occupant = board.cells[instance.anchorCellId]?.occupant;
    if (
      instance.state !== "resolved" &&
      instance.state !== "cancelled" &&
      occupant &&
      (occupant.type !== "special-match" || occupant.instanceId !== instance.instanceId)
    ) {
      issues.push(issue("special.orphan_instance", path, `Instance "${instance.instanceId}" is not present on its anchor cell.`));
    }
  }
  for (const cellId of board.topology.cellIds) {
    const occupant = board.cells[cellId]?.occupant;
    if (occupant?.type === "special-match" && !runtime.instances[occupant.instanceId]) {
      issues.push(issue("special.orphan_occupant", `board.cells.${cellId}`, `Cell holds Special Match "${occupant.instanceId}" with no instance record.`));
    }
  }
  if (limits.maxCombos < 1 || limits.maxDepth < 1) {
    issues.push(issue("special.invalid_cascade_limits", "cascade.limits", "Cascade limits must be positive."));
  }
  return issues;
}

export function validateCascadeLimits(limits: CascadeSafetyLimits): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [key, value] of Object.entries(limits)) {
    if (typeof value !== "number" || value < 1 || value > 10_000) {
      issues.push(issue("special.invalid_cascade_limits", `cascade.limits.${key}`, `Cascade limit "${key}" is out of bounds.`));
    }
  }
  return issues;
}
